# Skills Hub · URL 持久性与兼容审计

> 日期：2026-08-27（Asia/Shanghai）
> 范围：公开 skill / scene 详情 URL；未部署、未新增推测性 alias。

## 结论

Skills Hub 从首个提交起就使用以下公开详情路径，至当前 HEAD 没有发生路径迁移：

- `/skills/{id}/index.html`
- `/scenes/{id}/index.html`

因此不存在需要迁移的“旧详情路由”。新增 `/skill/{id}`、`/{id}` 等未经历史证明的 alias 反而会扩大长期兼容面，本轮不创建。

## 历史证据

- 首个提交 `c180750` 已在 builder 中生成并链接 `skills/{id}/index.html` 与 `scenes/{id}/index.html`。
- 后续场景重构 `395d5de`、GitHub-first 调整 `cb1bf38`、恢复站内详情链接 `9d2ee38` 均保留相同生成路径与 canonicalPath。
- `git log -S'/skills/'` 与 `git log -S'/scenes/'` 未发现另一套历史详情路径；变化只涉及站内链接优先指向 GitHub 或站内详情，不涉及详情 URL 改名。

## 当前生产核验

2026-08-27 使用跟随重定向的 HTTP 核验，以下代表路径均为 200，且没有发生重定向：

- `https://skills.zondev.top/skills/best-minds/index.html`
- `https://skills.zondev.top/skills/best-minds/`
- `https://skills.zondev.top/scenes/coding-engineering/index.html`
- `https://skills.zondev.top/scenes/coding-engineering/`

目录短链由当前静态托管行为提供；文档与机器索引继续把显式 `index.html` 作为 canonical，避免把托管平台的隐式补全当成跨平台保证。

## 自动回归

`scripts/smoke-contract.mjs` 现在逐项验证：

- 每个 Registry skill 都有 `skills/{id}/index.html`，且 canonical 精确指向同一路径；
- 每个 scene 都有 `scenes/{id}/index.html`，且 canonical 精确指向同一路径；
- 数据与详情 parity、来源、隐私泄露门继续成立。

若未来真的迁移路径，应先从 Git 历史、生产访问日志或已发布索引获得旧路径证据，再为该精确集合提供兼容；不得凭猜测扩展 alias。
