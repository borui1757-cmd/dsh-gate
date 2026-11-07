// contract.mjs —— 器官契约 + 对表
//
// 器官会漂移：DSH 一升级，我们手写的 pre-step 可能和真宿主不一样，而场景依然绿。
// 所以器官必须定期跟真机对表。两个来源：
//   ① 源码侧：在 DSH 的 dispatch 处找钩子名和载荷字段
//   ② 真机侧：probe 日志里真实请求的 options.keys
// 任一侧不一致 → 红灯。宁可不测，也不假绿。
import fs from 'node:fs';
import path from 'node:path';

// 器官声明自己依赖的契约
export const CONTRACT = {
  'agent/request': { file: 'dsh-agent-loop/lib/index.js', payload: ['turn', 'step', 'signal'] },
  'agent/pre-step': { file: 'dsh-agent-loop/lib/index.js', payload: ['messages'] },
  // llm/stream 的调度点是 waterfall(this, "llm/stream", options, ...)：
  // 源码只能证明"载荷是 options"，options 里有什么**静态看不出来**，
  // 只能靠真机 probe 验 messages。这里分开放，避免静态侧误报。
  'llm/stream': { file: 'dsh-llm/lib/index.js', payload: ['options'], dynamicOnly: ['messages'] },
};

function windowAround(text, needle, radius = 900) {
  const i = text.indexOf(needle);
  if (i < 0) return null;
  return text.slice(Math.max(0, i - radius), Math.min(text.length, i + radius));
}

/** 源码侧对表 */
export function checkSource(dshRoot) {
  const results = [];
  for (const [hook, spec] of Object.entries(CONTRACT)) {
    const file = path.join(dshRoot, spec.file);
    if (!fs.existsSync(file)) {
      results.push({ hook, ok: false, reason: `找不到 ${spec.file}` });
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    // 找 dispatch 点：waterfall(..., "hook" 或 "hook"
    const win = windowAround(text, `"${hook}"`, 1200);
    if (!win) {
      results.push({ hook, ok: false, reason: `源码里没找到 "${hook}" 的调度点` });
      continue;
    }
    const missing = spec.payload.filter((k) => !win.includes(k));
    results.push({
      hook,
      ok: missing.length === 0,
      ...(missing.length ? { reason: `调度点附近缺字段：${missing.join(', ')}` } : {}),
    });
  }
  return results;
}

/** 真机侧对表：从 probe 日志里看真实请求长什么样 */
export function checkProbe(logFile, minMessages = 1) {
  if (!fs.existsSync(logFile))
    return [{ hook: 'llm/stream(real)', ok: false, reason: `没有探针日志 ${logFile}（先跑一次真机请求）` }];

  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).slice(-50);
  const real = [];
  for (const l of lines) {
    try {
      const e = JSON.parse(l);
      if (e && Array.isArray(e.keys) && e.messagesIsArray) real.push(e);
    }
    catch { /* 跳过坏行 */ }
  }
  if (!real.length)
    return [{ hook: 'llm/stream(real)', ok: false, reason: '探针日志里没有一条带 messages 的真实请求' }];

  const last = real[real.length - 1];
  const need = ['provider', 'model', 'messages'];
  const missing = need.filter((k) => !last.keys.includes(k));
  return [{
    hook: 'llm/stream(real)',
    ok: missing.length === 0,
    ...(missing.length ? { reason: `真实请求缺字段：${missing.join(', ')}` } : {}),
    detail: `messages=${last.messagesLen} keys=${last.keys.slice(0, 8).join(',')}`,
  }];
}
