// index.js —— dsh-gate 插件入口
//
// 设计原则（今天踩坑换来的）：
//   智能可以决定「多跑什么」，不能决定「少跑什么」。
//   所以 gate_run 没有 skip 参数——想跳过，只能不调它。
import { runGate } from './run.js';

let defineTool = null;
try {
  ({ defineTool } = await import('@deepseek-ai/dsh-tools'));
}
catch {
  defineTool = null;
}

export const name = 'dsh-gate';
export const inject = ['tools'];

export function apply(ctx, config = {}) {
  if (!defineTool)
    return;

  const tools = (ctx && ctx.tools) || (typeof ctx.get === 'function' ? ctx.get('tools') : null);
  if (!tools || typeof tools.register !== 'function')
    return;

  tools.register(defineTool({
    name: 'gate_run',
    description: [
      '在目标项目里跑它的 tools/lab.mjs（宿主契约模拟 + 故障注入），返回通过/失败。',
      '只约定入口与退出码，不约定测试内容；退出码非 0 表示不许部署。',
    ].join(''),
    parameters: {
      dir: {
        type: 'string',
        description: '项目目录；省略则用会话工作目录',
      },
      timeoutMs: {
        type: 'number',
        description: '超时毫秒，默认 120000',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          dir: { type: 'string' },
          reason: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                ok: { type: 'boolean', required: true },
                exitCode: { type: 'integer' },
                tail: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const line = (s) => `${s.ok ? 'PASS' : 'FAIL'}  ${s.name}`;
        const head = value?.ok ? `gate PASS  ${value.dir}` : `gate FAIL  ${value.dir}${value?.reason ? ' — ' + value.reason : ''}`;
        const body = (value?.steps || []).map(line).join('\n');
        const bad = (value?.steps || []).find((s) => !s.ok);
        return [{ type: 'text', text: [head, body, bad ? '\n' + String(bad.tail || '').slice(-700) : ''].filter(Boolean).join('\n') }];
      },
    },
    execute(args, exec) {
      const cwd = (exec && exec.agent && exec.agent.session && exec.agent.session.cwd) || null;
      const dir = String(args?.dir || config.defaultDir || cwd || process.cwd());
      const r = runGate(dir, { timeoutMs: args?.timeoutMs, jobs: args?.jobs });
      return Promise.resolve({
        ok: r.ok,
        dir: r.dir,
        ...(r.reason ? { reason: r.reason } : {}),
        steps: (r.steps || []).map((s) => ({
          name: s.name,
          ok: Boolean(s.ok),
          ...(typeof s.exitCode === 'number' ? { exitCode: s.exitCode } : {}),
          tail: String(s.tail || '').slice(-1200),
        })),
      });
    },
  }));
}
