// check-contract.mjs —— 对表 CLI
//   node lib/check-contract.mjs <DSH根目录>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkSource, checkProbe } from './contract.mjs';

const dshRoot = process.argv[2]
  || process.env.DSH_CHECKOUT
  || 'C:/Users/19156/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai';

const probe = path.join(os.homedir(), '.dsh', 'dsh-claim-verify', 'probe-options.jsonl');

const rows = [...checkSource(dshRoot), ...checkProbe(probe)];
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));

console.log('='.repeat(64));
console.log(pad('契约', 26) + pad('结果', 8) + '说明');
console.log('-'.repeat(64));
let bad = 0;
for (const r of rows) {
  if (!r.ok) bad++;
  console.log(pad(r.hook, 26) + pad(r.ok ? 'PASS' : 'FAIL', 10) + (r.reason || r.detail || ''));
}
console.log('='.repeat(64));
console.log(bad ? `[x] ${bad} 项漂移，器官需要更新` : '[ok] 器官与真机一致');
process.exit(bad ? 1 : 0);
