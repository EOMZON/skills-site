# Skills Hub

> 产品源由两仓组成：公开、脱敏的数据真相在 `/Users/zon/Desktop/CreationOS/skills-registry`；本站 `/Users/zon/Desktop/CreationOS/skills-site` 只负责构建和呈现。私有作者源 `/Users/zon/.codex/skills` 不直接发布。

Skills Hub 是一个场景优先的公开技能目录。用户从“调研与决策、写作、设计、网站、工程、自动化、产品项目”等真实任务进入，查看推荐 skill、调用名、组合链和可审计的 GitHub 来源。

当前生命周期为 `maintenance / operating`。2026-08-26 快照包含 15 个公开 skills、7 个 scenes；公开 Registry 校验、静态构建、数据/详情/场景/隐私契约 smoke 与生产 HTTP/title 均通过。本轮没有覆盖 `skills-site` 的已有 builder 修改，也没有重写 `skills-registry` 的已有同步报告修改。

## Owner 边界

- 私有 `codex-skills-private`：skill 的作者真相、完整操作说明、脚本和私有资源。
- `skills-registry`：经脱敏、允许公开的 manifest、SKILL.md、场景分类和机器索引。
- `skills-site`：消费 Registry，生成 HTML、JSON、NDJSON 和 LLM 索引；不手写 skill 内容。
- Project Hub：只登记产品状态和真相源，不接管 skill 数据。

## 当前回归

- R0 PASS：三层 owner、canonical 仓库和早期“scenario-first”来源明确。
- R1 PASS：private author source → sanitized public registry → static renderer 单向生成。
- R2 PASS：15/15 skill 数据与详情、7/7 scene 数据与详情、starter/chain 引用和来源链接契约通过。
- R3 PASS：构建可重建且私有路径泄露会阻断；坏 manifest + 新 CSS 故障注入曾证明失败构建会半写资产，现已改为全部 Registry/manifest 输入解析成功后才首次写 dist，last-known-good 逐字节保持。Git 历史证明首版至今 canonical 路径没有迁移；自动契约锁定全部 skill/scene canonical，线上显式 `index.html` 与目录短链均为 200，因此没有需要补造的 legacy alias。
- R4 PASS：Registry validator、本地 build；2026-08-27 `skills.zondev.top` 首页、代表 skill/scene 的显式路径与目录短链均为 HTTP 200。每次发布绑定 source SHA/deploy receipt 仍是发布治理改进项，不回写为 R3 恢复缺口。
- R5 MISSING：没有“发现 → 调用 → 任务完成/复用”的可信结果证据。

完整分析见 `docs/analysis/2026-08-26-skills-site-origin-market-user-regression.md`。

## 验证

```bash
cd /Users/zon/Desktop/CreationOS/skills-registry && npm run validate
cd /Users/zon/Desktop/CreationOS/skills-site && npm run build
node scripts/smoke-contract.mjs
```

跨仓失败恢复证据见 `docs/verification/2026-08-27-skills-build-last-known-good.md`。
URL 持久性证据见 `docs/verification/2026-08-27-skills-url-compatibility.md`。
