// safe.mjs —— 把 guard 和 gate 串成一条命令（编排，不合并）
//
//   node lib/safe.mjs <项目目录> [--snapshot <要备份的文件>]
//
// 顺序：先备份（如果有） → 再跑门 → 汇总。
// 备份失败直接中止：宁可不部署，也不要在没退路的情况下动手。
import fs from 'node:fs';
import { runGate } from './run.js';

let guard = null;
try {
  // 同级目录的 dsh-guard（本地开发常见布局）；装进 profile 后也能按包名找到
  guard = await import('../../dsh-guard/lib/guard.js');
}
catch {
  try { guard = await import('dsh-guard/guard'); }
  catch { guard = null; }
}

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || process.cwd();
const snapIdx = args.indexOf('--snapshot');
const snapFile = snapIdx >= 0 ? args[snapIdx + 1] : null;
const keepIdx = args.indexOf('--keep');
const keep = keepIdx >= 0 ? Number(args[keepIdx + 1]) : 3;

const rows = [];
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));

// ① 备份（危险动作之前）
if (snapFile) {
  if (!guard) {
    console.log('[0/2 备份] 跳过：没找到 dsh-guard');
    rows.push({ name: '备份', ok: null });
  }
  else {
    const r = guard.snapshot(snapFile, { keep });
    console.log(`[0/2 备份] ${r.ok ? '已备份 → ' + r.snapshot : '失败：' + r.reason}`);
    rows.push({ name: '备份', ok: r.ok });
    if (!r.ok) {
      console.log('\n[x] 备份失败，中止（不在没退路的情况下动手）');
      process.exit(1);
    }
  }
}

// ② 跑门
const g = runGate(dir);
console.log(`\n[1/2 门] ${g.ok ? 'PASS' : 'FAIL'}  ${g.dir}${g.reason ? ' — ' + g.reason : ''}`);
for (const s of g.steps) console.log(`   ${s.ok ? 'ok  ' : 'fail'}  ${s.name}`);
rows.push({ name: 'gate', ok: g.ok });

// ③ 汇总
console.log('\n' + '='.repeat(48));
console.log(pad('步骤', 14) + '结果');
console.log('-'.repeat(48));
for (const r of rows) console.log(pad(r.name, 14) + (r.ok === null ? '跳过' : r.ok ? 'PASS' : 'FAIL'));
console.log('='.repeat(48));

const bad = rows.filter((r) => r.ok === false);
if (bad.length) {
  console.log(`\n[x] ${bad.map((r) => r.name).join(' / ')} 没过，不许部署`);
  process.exit(1);
}
console.log('\n[ok] 可以部署');
