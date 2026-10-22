# dsh-token-statistics

DSH Web 历史 Token 统计插件。左侧栏的新会话按钮下、插件入口上方添加 **Token统计**，通过原生主面板展示，不替换现有界面。

## 功能

- **日历 · 按日**：月度热力日历，点击日期查看该日输入、输出、缓存和推理 Token，以及各模型明细。
- **趋势 · 按月**：全年 12 个月消耗柱状图；点击月份返回该月日历。
- **模型筛选**：按提供商 + 模型区分，不会混合不同提供商的同名模型；所有摘要、日历及趋势同步筛选。
- **月度/年度摘要**：总 Token、输入、输出、活跃天数、单日峰值；模型消耗占比、调用次数和精确计数。
- 跟随 Harness 语言与深浅主题，适配窄屏，可手动刷新。

## 统计口径

1. 数据来自当前 DSH 挂载的会话存储和 `sessionProjections` 中的活跃会话，不查询上游账单，不读取 API 密钥。JSONL 后端采用只读物理解码兼容 v0–v4，使用官方公开 codec 校验物理序列，绕过与 usage 无关的整会话恢复/迁移开销及旧子代理元数据限制；其他存储后端使用 `sessionPersistence` 服务。原始日志不做任何改写。
2. 仅统计持久事件中的实际用量，不做字符估算。包括主代理与子代理；跳过 `inheritedEventCount` 以内 fork 继承的前缀，避免复制历史重复计数。
3. 以 `assistant/message` 和 `assistant/attempt` 实际结算记录计数。流中的累积 usage 只取最后一条，不重复相加。日志保留的、即使后来被压缩/替换的真实调用仍计入。
4. 根据当前 DSH 官方 token-meter 的语义，原始 `inputTokens` 为未缓存输入。本插件“输入”归一化为 **未缓存 + 缓存读 + 缓存写**；优先通过有效 `totalTokens - outputTokens` 求出完整输入。总量 = 完整输入 + 输出。缓存是输入的子项，推理是输出的子项，不额外加到总量上。
5. 没有有效输入/输出用量的调用不计入 Token 总数，并提示缺失量；失败/重试无 usage 的尝试也明确披露。日志只有输入/输出及部分缓存字段时，计入上报的已知计数，并明确提示汇总是消耗下限，不伪造缺失缓存。未上报的缓存/推理显示 `—`；部分上报汇总标 `*`，数字只包含已上报值。
6. 按浏览器 IANA 时区及结算事件时间归属日期，支持夏令时和半小时/45 分钟时区。
7. 已删除的会话、历史中未保存的调用、日志外的标题生成等 LLM 调用无法统计。Token 数不等于费用；本插件不估算价格。

## 安装与开发

本目录是可直接安装的 ESM bundle，不需要编译。依赖 `zod`，历史物理 codec 由兼容范围内的 DSH runtime 提供，React 由 Harness 提供。

兼容性：`engines.dsh`（`>=0.1.7-rc.2 <1.0.0-0`）单独决定 DSH 启动时的兼容检查，`peerDependencies` 不再参与。codec 改为运行时动态加载：若新版 runtime 移除或改名这些导出，插件改走 `sessionPersistence` 服务，不会加载失败；高于 v4 的未知会话代际逐个交给官方服务以只读方式打开。

```sh
npm install --ignore-scripts
npm run check
npm test
```

在 Harness 中通过 `plugin_manager` 安装此目录：

```json
{"action":"install_bundle","target":"/home/ubuntu/dsh_plugin/dsh-token-statistics","enabled":true}
```

安装持久化到当前 profile，重启仍会加载。修改本地源文件后，已加载 Host 模块需要显式重载，浏览器刷新可读取新的 Client 文件；不依赖 dev:web watcher。

## API 与生命周期

- 认证接口：`GET /api/dsh-token-statistics?timeZone=Asia%2FShanghai`。
- 返回每天/模型的数字聚合及覆盖率，不返回对话内容、文件路径、会话 ID 或凭证。
- 无效时区返回 400；无法列举历史返回 503，不以空统计掩盖失败。
- JSONL 历史扫描使用只读文件句柄，每会话选择最高版本、验证 Zstandard 完整帧及 checksum，最多 4 个并发，每会话仅解码一次，按文件物理指纹缓存并合并重叠请求；未变化历史不重复读取。残缺尾帧、序号不连续和校验失败会明确计入读取失败，不修复日志。非 JSONL 存储使用只读服务句柄，其内部读取行为由对应后端决定。
- 活跃会话由 Harness projection 增量折叠；卸载会撤销插槽、认证 API、projection，并取消/等待扫描、关闭所有句柄。
