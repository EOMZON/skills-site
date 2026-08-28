# Skills Hub · 源头、市场、用户、场景与功能回归

> 日期：2026-08-26（Asia/Shanghai）
> 证据边界：两仓 Git 历史、README/治理文档、当前公开 Registry、构建产物、契约 smoke 与生产 HTTP/title。没有用户访谈、调用遥测或任务完成回执。

## 1. 源头回归

`skills-site` 最早提交 `c180750`（2026-03-24）即定义为 scenario-first skills site；随后 `395d5de` 强化场景入口，`fcaf91e` 澄清公开/脱敏可见性，`1f3933b` 和 `9d2ee38` 建立来源回查与站内详情。同期 `skills-registry` 的 `a00fd45` 建立公开注册表，并通过后续提交持续收紧 sanitation。

原始问题不是“缺一个 skill 文件列表”，而是使用者知道自己要完成什么任务，却不知道哪个 skill 能做、如何调用、能否组合以及内容是否适合公开。产品承诺因此是：从任务场景进入，在一分钟内找到一个可信、可调用、来源可回查的公开 skill。

仍成立的假设：场景组织比按文件名浏览更接近用户意图；静态公开投影能把发现体验与私有作者库隔离。尚未证明：访客是否真的调用并完成任务。已经失效的假设：公开站可直接读取或镜像整个私有仓；现有治理明确要求脱敏 Registry 居中。

## 2. 市场与替代方案

| 替代方案 | 优势 | 缺口 | Skills Hub 裁决 |
|---|---|---|---|
| Codex 内置 skills 列表 / `$skill` | 调用近、Agent 自动路由 | 人类难以按任务浏览，公开来源与组合关系弱 | 服务发现和理解，不复制运行时路由 |
| GitHub 仓库浏览 / `rg` | 权威、维护成本低 | 依赖命名知识，场景与 starter chain 不直观 | 每个条目必须回链 GitHub，站点只做索引层 |
| 通用 Agent/Prompt marketplace | 数量多、外部生态大 | 质量、隐私与个人工作流匹配不稳定 | 不比数量；只发布可审计、可维护的小集合 |
| Prompt Hub | 复制即用，门槛低 | Prompt 不包含流程、脚本、资源和触发约定 | 两站分离，可互链但不可混合身份 |
| 私有 skills 仓库 | 内容最完整、作者真相明确 | 不可直接公开，且公开读者不应看到本机路径/秘密 | 永远保持作者源；只经 sanitation 导出 |

差异化是“个人精选 + 场景优先 + 调用/组合可见 + 来源可审计 + 私有边界明确”。停止条件：连续四周没有至少 5 次真实 skill 调用回执，或站点找回不优于 GitHub/运行时列表，则降为 archived/available，不再扩分类。

## 3. 用户分析

- 主用户（high confidence）：Zon / Codex，在研究、设计、开发、发布等任务中需要快速找回成熟 skill。
- 次用户（hypothesis）：公开访客，知道任务目标但不熟悉私有命名与仓库结构。
- 维护者：Zon / Codex，负责私有源、脱敏 Registry 和站点投影的 owner 交接。
- 非用户：只想复制一段 prompt 的人应进入 Prompt Hub；寻找全部私有自动化细节的人不属于公开站受众。

Top job：从一个真实任务出发，在 60 秒内找到适合的 skill，理解 `$invoke` 与组合方式，并能回查公开来源。

失败代价：推荐引用不存在的 skill；详情与数据数量漂移；公开页面泄露本机路径或秘密；站点手写内容覆盖 Registry；用户找到条目却不知道如何调用；调用后没有结果反馈。

## 4. 核心使用场景

### S1 · 首次价值：任务 → 场景 → skill

进入首页 → 选择场景 → 查看 core tasks / starter skills → 打开详情 → 复制或记住 `$invoke` → 在 Codex 中调用。

成功：60 秒内进入一个真实详情并得到有效调用名。当前 `PASS/PARTIAL`：页面和数据链完整，缺真实任务计时与调用回执。

### S2 · 组合路线：从单个工具到工作流

进入 scene guide → 查看 starter 与 chain → 按顺序打开相关 skill → 回查来源与限制 → 组合执行。

成功：chain 中每个 ID 都能解析到公开条目，且不存在断链。当前 `PASS`：smoke 固定所有 starter/chain 引用。

### S3 · 维护与发布

私有 skill 更新 → 人工筛选/脱敏导出 Registry → Registry validate → site build → privacy/structure smoke → 预览 → Vercel 发布 → 核验生产。

成功：公开条目数量、详情、场景和机器索引一致，任何私有绝对路径/密钥特征阻断。当前 `PASS`：15 skills / 7 scenes 全链一致。

### S4 · 异常恢复

单条 schema 错误 / 断链 / 私有信息泄露 / 旧链接失效 → validator 或 smoke 明确报错 → 回到 Registry 修复 → 重建投影。

成功：不从 `dist` 或网站反向修数据，不静默发布半套目录。当前 `PARTIAL`：全量失败可见；坏 manifest 在任何新 site asset 写入前 fail-closed，last-known-good 逐字节保留。仍缺兼容重定向清单与 deploy receipt。

## 5. 服务链与 owner

```text
私有作者源 codex-skills-private
  → 筛选与 sanitation
  → skills-registry（公开数据真相）
  → skills-site builder（只读消费）
  → HTML + JSON + NDJSON + llms.txt
  → skills.zondev.top
  → 用户调用 skill
  → 任务完成 / 再次复用（当前无 receipt）
```

最大 handoff gap 是“站内发现 → 实际调用 → 任务完成”。页面访问和 GitHub 点击不能证明 skill 有用。第二断点是私有源到公开 Registry 的人工发布选择；已有 sync audit，但当前没有每次生产部署绑定 source SHA 的回执。

## 6. R0–R5

| Gate | 证据 | 判定 | 下一退出门槛 |
|---|---|---|---|
| R0 源头 | 两仓首批提交、README、三层 owner line | PASS | 私有源和公开投影不可倒置 |
| R1 结构 | private → sanitized registry → renderer 单向链 | PASS | 为发布记录 source SHA |
| R2 核心链路 | 15 skills、7 scenes、详情、starter/chain、GitHub 来源 | PASS | 固化真实浏览器 scene→skill→source 测试 |
| R3 恢复 | validator、全量 build、隐私泄露阻断；坏 manifest + CSS 漂移 fixture 验证首次 dist 写入晚于全部跨仓输入解析 | PARTIAL | 旧链接兼容清单与 deploy receipt |
| R4 发布 | validate/build 通过；生产 HTTP 200/title | PASS | source SHA + deploy receipt |
| R5 结果 | 无调用、任务完成、复用率证据 | MISSING | 四周 ≥5 次真实调用并记录结果/找回耗时 |

## 7. 本轮门禁

`scripts/smoke-contract.mjs` 验证：

- Registry 总数、JSON 数组、NDJSON、skill 数据与详情数量一致，ID 唯一。
- 7 个 scenes 的数据和详情存在；每个 starter / chain ID 都解析到公开 skill。
- 每条 skill 有 title、summary、scene、invoke、公开可见性和 EOMZON/skills-registry 来源链接。
- `llms.txt`、`llms-full.txt` 和 sitemap 非空；canonical 指向 `skills.zondev.top`。
- 公开投影不存在 `/Users/...`、私有 skills 绝对路径或常见 secret/private-key 特征。

## 8. 优先级

1. P0（本轮）：源头/owner 收敛、完整分析、结构与隐私契约、Project Hub 真相源——完成。
2. P1：把 scene → skill → GitHub source 的系统 Chrome 证据固化为仓内可重复测试。
3. P1：发布时记录 Registry source SHA 与 Vercel deploy receipt。
4. P2：四周记录真实调用、任务完成与再次复用；证据不足则归档。

Stop Doing：不把私有仓直接发布、不在 site 手写 skill 内容、不把 prompt 与 skill 混站、不以条目数量替代任务结果、不为无调用证据继续扩分类。
