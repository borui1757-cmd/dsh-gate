// 场景：时间注入落到最后一条 user 消息
// 需要器官：pre-step（能拿到并改 messages）
// 注意：这个场景【不装】stream —— 证明"器官少装也能测"，而且不会被无关钩子干扰。
import { pathToFileURL } from 'node:url';
import { assemble, runTurn } from '../../lib/assemble.mjs';

export const needs = ['pre-step'];

const CV = 'C:/Users/19156/Documents/deepseek-harness/default-workspace/plugins/dsh-claim-verify';
const { apply } = await import(pathToFileURL(CV + '/lib/index.js').href);

const host = assemble(needs);
apply(host.ctx, { enable: true, annotate: false, injectTime: true, sanitizeMessages: false, portTimeoutMs: 2000 });

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  XX  ' + n + '  ' + e); } };

const out = await runTurn(host, { messages: [{ role: 'user', content: '现在几点了' }] });
const lastUser = [...out.messages].reverse().find((m) => m.role === 'user');
const txt = JSON.stringify(lastUser?.content ?? '');

check('最后一条 user 带注入', txt.includes('[系统注入] 当前时间'), txt.slice(0, 80));
check('原有内容没被覆盖', txt.includes('现在几点了'));
check('只注入一次', (txt.match(/\[系统注入\]/g) || []).length === 1);

process.exit(fail ? 1 : 0);
