# 02 — 分组多选与 install/remove 交互

**What to build:** 将交互式 Skill 选择升级为树状分组多选，并让 `install` 与 `remove` 使用统一的 Skill Group 选择体验。用户可以直接操作组，也可以操作单个 Skill，同时清楚看到部分选中状态。

**Blocked by:** 01 — Skill Group 分组模型与 list 展示

**Status:** resolved

- [ ] 多选支持可聚焦的组行和缩进的子 Skill 行；组行不出现在提交结果中。
- [ ] 组行使用 `○`、`◐`、`●` 表示未选、半选、全选，并与子项双向联动。
- [ ] `Space` 切换焦点行，`A` 在全选和全清之间切换，`Enter` 提交子 Skill，取消语义保持不变。
- [ ] 所有组保持展开，组间显示一个非焦点空行；最多八个可导航行，长组滚动时保留当前组上下文。
- [ ] `install` 默认全选，`remove` 默认不选；两者的选项按手动组优先和仓库组排序。
- [ ] Prompt 公共 seam 测试覆盖三态、父子联动、全局快捷键、提交顺序、组间间距和长列表上下文。
- [ ] install/remove 命令测试验证分组 options、初始选择与取消行为。
