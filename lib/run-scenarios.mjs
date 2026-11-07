// run-scenarios.mjs —— 并行跑所有 *.scenario.mjs
//
// 每个场景是一个独立进程：真隔离、真并行。
// 约定：退出码 0 = 通过；stdout 里以 "  ok" / "  XX" 开头的行会被汇总。
//
// 用法：node lib/run-scenarios.mjs <scenarioDir> [--jobs=4]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || 'scenarios');
const jobsArg = process.argv.find((a) => a.startsWith('--jobs='));
const jobs = jobsArg ? Math.max(1, Number(jobsArg.split('=')[1])) : 4;

if (!fs.existsSync(dir)) {
  console.error(`没有目录：${dir}`);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.scenario.mjs')).sort();
if (!files.length) {
  console.error(`目录里没有 *.scenario.mjs：${dir}`);
  process.exit(1);
}

const t0 = Date.now();
const results = new Array(files.length).fill(null);
let cursor = 0;

function nextIndex() {
  return cursor < files.length ? cursor++ : -1;
}

function runOne(i) {
  return new Promise((resolve) => {
    const file = path.join(dir, files[i]);
    const log = path.join(os.tmpdir(), `dsh-gate-sc-${Date.now()}-${i}.log`);
    // 独立进程 + 独立日志：并行不会互相污染
    const child = spawn(`node "${file}" > "${log}" 2>&1`, {
      cwd: dir,
      shell: true,
      stdio: 'ignore',
      env: { ...process.env, DSH_GATE_SCENARIO: files[i] },
    });
    child.on('exit', (code) => {
      let out = '';
      try { out = fs.readFileSync(log, 'utf8'); } catch { /* ignore */ }
      try { fs.unlinkSync(log); } catch { /* ignore */ }
      results[i] = { file: files[i], ok: code === 0, code, out };
      resolve();
    });
    child.on('error', (e) => {
      results[i] = { file: files[i], ok: false, code: null, out: String(e.message) };
      resolve();
    });
  });
}

async function worker() {
  for (;;) {
    const i = nextIndex();
    if (i < 0) return;
    await runOne(i);
  }
}

await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));

const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
console.log('\n' + '='.repeat(60));
console.log(pad('场景', 34) + pad('结果', 8) + '断言');
console.log('-'.repeat(60));
let bad = 0;
for (const r of results) {
  const okLines = (r.out.match(/^\s+ok\s+/gm) || []).length;
  const badLines = (r.out.match(/^\s+XX\s+/gm) || []).length;
  if (!r.ok) bad++;
  console.log(pad(r.file.replace('.scenario.mjs', ''), 34) + pad(r.ok ? 'PASS' : 'FAIL', 10) + `${okLines}✓ ${badLines}✗`);
}
console.log('='.repeat(60));
console.log(`并行 ${Math.min(jobs, files.length)} 路 | 耗时 ${Date.now() - t0} ms | ${results.length - bad}/${results.length} 通过`);

if (bad) {
  console.log('\n失败详情：');
  for (const r of results) if (!r.ok) console.log(`\n--- ${r.file} (exit ${r.code})\n${r.out.slice(-800)}`);
  process.exit(1);
}
