# Skills Hub · 跨仓构建 last-known-good 门

> 日期：2026-08-27（Asia/Shanghai）
> 范围：公开 Registry/manifest 读取失败时的站点 dist 一致性；未部署，未改私有作者源或公开 Registry 数据。

## 问题

Skills Hub 的 owner 链是：私有作者源 → 脱敏 `skills-registry` → `skills-site`。旧 builder 在读取 Registry/manifest 前先把新 CSS/favicon 写入 dist。于是单条 manifest 损坏虽然令构建失败，新资产仍可能覆盖 last-known-good，留下旧 HTML + 新 CSS 的混合发布目录。

## 红灯证据

隔离 fixture 同时：

- 把 Registry 第一个 skill manifest 改成非法 JSON；
- 给 site source CSS 加入 `must-not-leak-from-failed-build` sentinel；
- 保存构建前完整 dist 树 SHA-256 摘要；
- 运行真实 builder，并比较失败后的 dist。

修复前构建按预期非零退出，但 dist 摘要由 `d319…715` 变为 `3c47…ac9`，证明 CSS 已半写。

## 最小修复

只调整 `scripts/build-site.mjs` 的执行顺序：先读取 scenes、registry、scene guides 与全部 skill manifests，建立 maps、scene entries 与统计；这些跨仓输入全部成功后，才发生第一次 dist 写入。

没有引入第二份 Registry、staging 发布系统或“跳过坏 skill”分支。公开目录必须全量一致，坏条目继续 fail-closed。

## 回归

```text
node scripts/smoke-build-recovery.mjs  PASS · bad manifest + changed CSS preserves dist byte-for-byte
skills-registry npm run validate       PASS · 15 skills
skills-site npm run build              PASS
node scripts/smoke-contract.mjs        PASS · 15 skills / 7 scenes / 56 public files
git diff --check                       PASS
```

## 完成度边界

R3 的坏输入半写断点已关闭。URL 持久性另见 `2026-08-27-skills-url-compatibility.md`；两项合并后 R3 为 PASS。每次生产发布绑定 source SHA/deploy receipt 属于 R4 发布治理改进项，不再混入 R3。R5 仍没有发现→调用→任务完成/复用结果。
