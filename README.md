# dsh-gate

> 部署前的一道总门：**插件自己声明入口，gate 只认退出码**。不写死场景，不接管生命周期。

## 特性

- **只约定两件事**：`tools/lab.mjs`（或 `scenarios/*.scenario.mjs`）+ 退出码 0。任何插件都能接，不用改 gate。
- **器官化模拟**：按 `needs` 只装被测的那几个钩子（`request` / `pre-step` / `stream` / `provider`），不克隆整个宿主。缺器官直接报错，**不静默降级**。
- **并行场景**：每个场景独立进程、独立日志，天然隔离；10 个场景也是秒级。
- **契约对表**：器官 vs DSH 源码 vs 真机 probe 日志，双侧比对，漂移即红灯。
- **空项目 = FAIL**：没有可跑入口不会被当成“通过”，杜绝假绿。
- **无 skip 参数**：`gate_run` 没有跳过开关——想跳过只能不调它。

## 用法

```js
// 场景文件：声明需要哪些器官
export const needs = ['pre-step', 'provider'];
const host = assemble(needs);
apply(host.ctx, config);
const out = await runTurn(host, { messages });
```

```bash
node lib/run-scenarios.mjs examples/scenarios --jobs=4   # 并行跑场景
node lib/check-contract.mjs                              # 契约对表
node lib/safe.mjs <项目> [--snapshot <文件>]              # 备份 + 跑门 + 汇总
```

宿主内提供工具：`gate_run(dir)`。

## 它不做什么

| 不做 | 原因 |
|---|---|
| 复制真实宿主 | 那是 `dsh-testkit` / `dsh-test-drive` 的活 |
| 安装/启动/卸载生命周期 | 同上 |
| 内置测试场景 | 场景属于被测插件 |
| 测存储层/并发/真实模型 | 只有真机能测 |

## 标签

`dsh-plugin` `testing` `fault-injection` `contract-testing` `fake-host` `ci-gate` `deploy-gate` `scenario` `sandbox` `nodejs`

## 状态

0.1.0 —— 器官 + 并行场景 + 契约对表跑通；示例 3 场景 / 10 断言 全绿。
