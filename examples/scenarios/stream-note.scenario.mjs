// 场景：有工具调用的轮次不追加【核验】；无工具调用的轮次照常追加
// 需要器官：pre-step（消毒/注入）+ stream（看模型流里被追加了什么）
import { pathToFileURL } from 'node:url';
import { assemble, runTurn } from '../../lib/assemble.mjs';

export const needs = ['pre-step', 'stream'];

const CV = 'C:/Users/19156/Documents/deepseek-harness/default-workspace/plugins/dsh-claim-verify';
const { apply } = await import(pathToFileURL(CV + '/lib/index.js').href);

const host = assemble(needs);
apply(host.ctx, { enable: true, annotate: true, injectTime: false, sanitizeMessages: true, portTimeoutMs: 2000 });

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  XX  ' + n + '  ' + e); } };

// ① 带工具调用：不该追加
const withTool = await runTurn(host, {
  messages: [{ role: 'user', content: 'probe port' }],
  reply: { text: ['端口 59999 正在监听。'], toolCalls: [{ id: 'call_B', name: 'probe', args: '{}' }] },
});
check('有工具调用 → 无【核验】', !withTool.text.includes('【核验】'), JSON.stringify(withTool.text.slice(-60)));
check('回复正文还在', withTool.text.includes('59999'));

// ② 不带工具调用：应该追加（用不同端口，避开 60s 去重）
const noTool = await runTurn(host, {
  messages: [{ role: 'user', content: 'what time is it' }],
  reply: { text: ['端口 59997 正在监听。'] },
});
check('无工具调用 → 有【核验】', noTool.text.includes('【核验】'), JSON.stringify(noTool.text.slice(-120)));

process.exit(fail ? 1 : 0);
