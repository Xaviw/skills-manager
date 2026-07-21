# 03 — add 按 Managed Skill Identity 覆盖

**What to build:** 让 `add` 按 Source Skill 名称稳定排序，并依据 Managed Skill Identity 识别重复来源。同一仓库、同一 `skillPath` 的重新添加直接更新原目录，不再创建重命名副本；用户的项目引用因此保持稳定。

**Blocked by:** 01 — Skill Group 分组模型与 list 展示

**Status:** resolved

- [ ] 交互式 add 按 display name 自然升序显示，名称相同时按 `skillPath` 稳定排序。
- [ ] 同一 Repository Identity 与 `skillPath` 的已有 Managed Skill 复用原 directory name，并通过现有原子替换流程覆盖内容与 metadata。
- [ ] 上游 display name 改变时仍复用旧目录名，并更新展示名称与 tracking metadata。
- [ ] GitHub HTTPS、SSH、shorthand 之间能识别同一仓库；ref 变化不阻止覆盖且写入新的 ref。
- [ ] 同一仓库但不同 `skillPath`、不同仓库或 Manual Skill 目录冲突时，继续使用交互重命名或显式模式错误。
- [ ] 缺少 `skillPath` 的旧 lock entry 不被 add 推断为同一 Skill；多个 entry 声明同一身份时报告 tracking 冲突。
- [ ] add 命令测试覆盖排序、同身份覆盖、上游改名、URL 归一化、ref 变化和冲突边界。
