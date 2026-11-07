// assemble.mjs —— 按需装配「器官」，不克隆整个宿主。
//
// 原则：
//   ① 器官要显式声明（needs），不靠猜——猜出来的覆盖率不可信。
//   ② 只装声明的器官；没装的钩子永远不会被调用，所以不会被误测。
//   ③ 缺器官 = 立刻报错，不静默降级（静默降级会造出假绿）。

export const ORGANS = {
  // agent/request：载荷只有 {turn,step,signal}，只能改 provider/model
  request: (h) => h.define('agent/request', async (payload, next) => next()),
  // agent/pre-step：唯一能拿到并改写 messages 的钩子
  'pre-step': (h) => h.define('agent/pre-step', async (payload, next) => next()),
  // llm/stream：完整请求 + chunk 协议
  stream: (h) => h.define('llm/stream', (options, next) => next()),
  // provider：不挂钩子，只声明"这轮有真值校验能力"（校验函数由 providerReject 提供）
  provider: (h) => h.capabilities.add('provider'),
};

export function createHost() {
  const handlers = new Map();
  const host = {
    handlers,
    capabilities: new Set(),
    define(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    ctx: {
      on(name, fn) {
        if (!handlers.has(name)) handlers.set(name, []);
        handlers.get(name).push(fn);
      },
      tools: { register() {} },
      get() { return null; },
    },
  };
  return host;
}

/**
 * 装配宿主。needs 里出现未知器官直接抛错。
 */
export function assemble(needs = []) {
  const host = createHost();
  for (const n of needs) {
    const organ = ORGANS[n];
    if (!organ) throw new Error(`未知器官: ${n}（可用：${Object.keys(ORGANS).join(', ')}）`);
    organ(host);
  }
  return host;
}

// 异步 waterfall
export async function waterfall(host, name, payload, fallback) {
  const hs = host.handlers.get(name) || [];
  let i = 0;
  const next = async () => (i < hs.length ? hs[i++](payload, next) : fallback());
  return next();
}

// 流式 waterfall（必须同步返回 AsyncIterable）
export function waterfallStream(host, name, options, fallback) {
  const hs = host.handlers.get(name) || [];
  let i = 0;
  const next = () => (i < hs.length ? hs[i++](options, next) : fallback());
  return next();
}

// 假模型流：把 reply 变成宿主的 chunk 协议
export function fakeStream(reply = {}) {
  return (async function* () {
    let idx = 0;
    for (const part of reply.text ?? []) yield { type: 'text-delta', index: idx++, text: part };
    for (const c of reply.toolCalls ?? []) yield { type: 'tool-call-delta', index: idx++, id: c.id, name: c.name, arguments: c.args ?? '{}' };
    yield { type: 'finish', reason: (reply.toolCalls ?? []).length ? 'tool-calls' : 'stop' };
  })();
}

/** 按宿主顺序跑一轮：request → pre-step → stream（没装 stream 就不跑） */
export async function runTurn(host, { messages, provider = 'p', model = 'm', reply = { text: ['ok'] } } = {}) {
  const config = await waterfall(host, 'agent/request', { turn: 1, step: 1, signal: null }, async () => ({ provider, model }));
  const decision = await waterfall(host, 'agent/pre-step', { messages, turn: 1, step: 1, signal: null }, async () => ({ kind: 'enter', messages }));
  if (decision && decision.kind === 'reject') return { messages, text: '' };

  const options = { provider: config.provider, model: config.model, messages: (decision && decision.messages) || messages };
  let text = '';
  if ((host.handlers.get('llm/stream') || []).length) {
    for await (const c of waterfallStream(host, 'llm/stream', options, () => fakeStream(reply))) {
      if (c.type === 'text-delta' && typeof c.text === 'string') text += c.text;
    }
  }
  return { messages: options.messages, text };
}

// provider 的配对校验（报错文案与 DeepSeek 一致）
export function providerReject(messages) {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const types = m.content.map((b) => (b && b.type) || '');
    const lastCall = Math.max(types.lastIndexOf('tool-call'), types.lastIndexOf('tool_use'));
    if (lastCall < 0) continue;
    if (lastCall < m.content.length - 1)
      return `messages.${i}.${lastCall}: tool_use without tool_result immediately after`;
    const next = messages[i + 1];
    if (!next || next.role !== 'tool')
      return `messages.${i}.${lastCall}: tool_use without tool_result immediately after`;
  }
  return null;
}
