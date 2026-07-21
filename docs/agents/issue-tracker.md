# Issue tracker：本地 Markdown

本仓库的 issue 和 spec（也称 PRD）使用 `.scratch/` 下的 Markdown 文件管理。

## 约定

- 每个 feature 使用一个目录：`.scratch/<feature-slug>/`
- Spec 路径为 `.scratch/<feature-slug>/spec.md`
- 每个实现 ticket 使用独立文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- Ticket 从 `01` 开始编号，不使用合并的 tickets 文件
- 评论和讨论记录追加到文件底部的 `## Comments` 标题下

## 当 skill 要求“发布到 issue tracker”时

在 `.scratch/<feature-slug>/` 下创建文件；目录不存在时一并创建。

## 当 skill 要求“获取相关 ticket”时

读取用户提供的文件路径或 issue 编号对应的文件。

## Wayfinding 操作

`/wayfinder` 使用一个 map 文件，并为每个 ticket 创建一个子文件。

- **Map**：`.scratch/<effort>/map.md`，包含 Notes、Decisions-so-far 和 Fog
- **子 ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号
- **类型**：使用 `Type:` 记录 `research`、`prototype`、`grilling` 或 `task`
- **状态**：使用 `Status:` 记录 `claimed` 或 `resolved`
- **阻塞关系**：在文件顶部附近使用 `Blocked by: NN, NN`
- **Frontier**：扫描未关闭、未阻塞且未认领的 ticket，编号最小者优先
- **认领**：开始工作前将 `Status:` 改为 `claimed` 并保存
- **解决**：在 `## Answer` 下追加答案，将状态改为 `resolved`，再把摘要和链接追加到 `map.md` 的 Decisions-so-far
