# 01 — Skill Group 分组模型与 list 展示

**What to build:** 为 CLI 建立统一的 Repository Identity、Managed Skill Identity 与 Skill Group 规则，并让 `list` 以手动技能组优先、仓库组随后展示 Base Skill。用户可以稳定识别来源、比较组内 Skill，并在不同来源输入形式下看到一致分组。

**Blocked by:** None — can start immediately

**Status:** resolved

- [ ] GitHub HTTPS、SSH 和 shorthand 输入按大小写不敏感的 canonical `owner/repo` 合并；非 GitHub Git URL 精确区分；本地来源按解析后的绝对目录区分。
- [ ] `list` 将 Manual Skill 作为第一组，非空 Repository Group 按展示名称自然升序排列，组内按 directory name 自然升序排列。
- [ ] 名称排序忽略大小写并支持数字自然顺序；相等时使用稳定身份字段保证顺序一致。
- [ ] 空组不输出；没有 Base Skill 时保留现有空状态消息。
- [ ] 现有 list、source parser 和相关命令测试覆盖身份归一化、手动组优先、排序和空组行为。
- [ ] 通过仓库既有 lint、format、type-check 和相关测试。
