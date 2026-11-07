// run.js —— gate 的执行核心（纯逻辑，不依赖 DSH 宿主）
//
// 三道检查，有哪道跑哪道：
//   ① tools/lab.mjs            单入口（老约定）
//   ② scenarios/*.scenario.mjs 器官化场景，并行跑
//   ③ 契约对表                 器官 vs 真机（只在有 scenarios/ 时跑）
//
// 铁律：**一个入口都没有 = FAIL**。不许因为"没东西可跑"就绿。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(here, 'run-scenarios.mjs');
const CONTRACT_CLI = path.join(here, 'check-contract.mjs');

function runCmd(cwd, cmd, timeoutMs) {
  const log = path.join(os.tmpdir(), `dsh-gate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.log`);
  // DSH 沙箱下管道 stdio 会 EPERM，用 shell 重定向到文件再读
  const r = spawnSync(`${cmd} > "${log}" 2>&1`, { cwd, shell: true, timeout: timeoutMs, stdio: 'ignore' });
  let out = '';
  try { out = fs.readFileSync(log, 'utf8'); } catch { /* 读不到就算了 */ }
  try { fs.unlinkSync(log); } catch { /* 清理失败不影响结论 */ }
  const exitCode = typeof r.status === 'number' ? r.status : null;
  return { ok: exitCode === 0, exitCode, tail: out.slice(-1500) };
}

/**
 * @returns {{ok:boolean, dir:string, steps:Array, reason?:string}}
 */
export function runGate(dir, opts = {}) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs))
    return { ok: false, dir: abs, steps: [], reason: '目录不存在' };

  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 180000;
  const steps = [];

  // ① 单入口
  const lab = path.join(abs, 'tools', 'lab.mjs');
  if (fs.existsSync(lab))
    steps.push({ name: 'lab', ...runCmd(abs, 'node tools/lab.mjs', timeoutMs) });

  // ② 器官化场景（并行）
  const scDir = path.join(abs, 'scenarios');
  if (fs.existsSync(scDir) && fs.readdirSync(scDir).some((f) => f.endsWith('.scenario.mjs'))) {
    const jobs = Number.isInteger(opts.jobs) ? opts.jobs : 4;
    steps.push({ name: 'scenarios', ...runCmd(abs, `node "${RUNNER}" "${scDir}" --jobs=${jobs}`, timeoutMs) });
    // ③ 契约对表（只在用器官时才有意义）
    if (opts.contract !== false)
      steps.push({ name: 'contract', ...runCmd(abs, `node "${CONTRACT_CLI}"`, timeoutMs) });
  }

  if (!steps.length)
    return { ok: false, dir: abs, steps, reason: '没有可跑的入口（tools/lab.mjs 或 scenarios/）' };

  const ok = steps.every((s) => s.ok);
  return { ok, dir: abs, steps, ...(ok ? {} : { reason: steps.filter((s) => !s.ok).map((s) => s.name).join(', ') + ' 未通过' }) };
}
