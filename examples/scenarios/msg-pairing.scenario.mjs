// 场景：畸形历史（tool_use 缺配对）→ 经插件后 provider 能接受
// 需要器官：pre-step（改 messages）+ provider（校验规则）
import { pathToFileURL } from 'node:url';
import { assemble, runTurn, providerReject } from '../../lib/assemble.mjs';

export const needs = ['pre-step', 'provider'];

const CV = 'C:/Users/19156/Documents/deepseek-harness/default-workspace/plugins/dsh-claim-verify';
const { apply } = await import(pathToFileURL(CV + '/lib/index.js').href);

const host = assemble(needs);
apply(host.ctx, { enable: true, annotate: true, injectTime: false, sanitizeMessages: true, portTimeoutMs: 2000 });

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  XX  ' + n + '  ' + e); } };

const poisoned = [
  { role: 'user', content: 'edit cascade to 64164' },
  {
    role: 'assistant',
    content: [
      { type: 'reasoning', text: 'Let me edit and run.' },
      { type: 'text', text: 'matched.' },
      { type: 'tool-call', id: 'call_A', name: 'edit', arguments: '{}' },
      { type: 'text', text: '\n\n【核验】本条回复有 1 处断言与实际不符' },
    ],
  },
  { role: 'user', content: 'what happened' },
];

check('原样会被 provider 拒', providerReject(poisoned) !== null);

const out = await runTurn(host, { messages: poisoned });
check('经插件后 provider 接受', providerReject(out.messages) === null, String(providerReject(out.messages)));
check('补了 tool 占位', out.messages.some((m) => m.role === 'tool' && m.tool_call_id === 'call_A'));
check('尾块信息没丢', JSON.stringify(out.messages).includes('【核验】'));

process.exit(fail ? 1 : 0);
