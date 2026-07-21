# 04 — update 分组结果与旧 lock 修复

**What to build:** 让 `update` 的选择、失败和跳过结果都使用 Skill Group，并为缺少 `skillPath` 的旧 lock entry 提供安全修复。唯一匹配时重新安装当前内容并补齐 tracking metadata，无法判断时保持 per-Skill 隔离并明确报告。

**Blocked by:** 01 — Skill Group 分组模型与 list 展示；02 — 分组多选与 install/remove 交互

**Status:** resolved

- [ ] 交互式 update 按 Skill Group 展示候选，repair candidate 默认选中；组行状态与子项联动。
- [ ] failed updates 和 skipped Skills 的多项结果按手动组规则与 Repository Group 规则输出；成功消息仍只显示计数。
- [ ] 无参数 update 对缺少 `skillPath` 的 local、GitHub 和普通 Git entry 尝试获取来源并发现 Skill。
- [ ] 来源中按 displayName 大小写不敏感精确匹配且唯一时，重新安装当前内容并写入 `skillPath`、可用 hash、ref 和时间 metadata。
- [ ] 零匹配或多匹配不推断、不修改 entry；无参数模式继续处理其他 Skill，显式 update 模式以失败结束。
- [ ] 修复和普通更新继续遵循 Source intake 生命周期、Base Skill per-Skill atomicity 与现有 spinner/取消语义。
- [ ] update/source-intake 测试覆盖唯一匹配、大小写、三类来源、歧义、交互选择、失败继续和分组结果。
