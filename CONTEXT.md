# Domain Context

## Glossary

### Base Skill

存放在 base directory 中的 Skill。实际目录决定 Base Skill 是否存在。

### Managed Skill

拥有对应 lock tracking metadata 的 Base Skill。lock 只记录 tracking metadata，不决定 Skill 是否存在。

Managed Skill 是 Base Skill 的 tracking 状态，不是独立于 Base Skill 的存储实体。

缺少 lock entry 的 Base Skill 是 unmanaged Skill；只有 lock entry、没有实际目录的数据是 stale metadata，不代表 Skill 存在。

stale metadata 在读取时被忽略但保留，不自动删除。

## Invariants

- 批量操作采用 per-Skill atomicity，不提供整批 all-or-nothing 语义。
- 单个 Managed Skill 更新成功时，目录与 tracking metadata 必须同时更新；更新失败时，两者必须共同保留更新前的状态。
- 原子性只覆盖进程内可捕获的错误；不承诺在断电或进程被强制终止后自动恢复未完成操作。

### Source Descriptor

描述如何重新获取一个来源。获取方式只有 local 与 git；GitHub 是 git 来源的一项 provider 能力，不是独立获取方式。

远程 Skill 的来源身份由 repository URL、可选 ref 和 repository-root-relative `skillPath` 共同组成。未指定 ref 表示跟踪仓库当前默认分支。

### Repository Identity

用于判断 Managed Skill 是否来自同一仓库的身份；ref 不属于 Repository Identity。GitHub 仓库以大小写不敏感的 `owner/repo` 标识，其他 Git 仓库以完整 URL 标识，本地来源以解析后的绝对来源目录标识。

### Managed Skill Identity

由 Repository Identity 与来源内的 `skillPath` 共同组成；同一身份的重新 intake 可以复用原有目录，ref 变化不改变该身份。

### Skill Group

共享同一 Repository Identity 的 Managed Skill 集合。Manual Skill 不具备 Repository Identity，统一属于独立的手动技能组。

### Source Skill

Source intake 从来源中发现的有效 Skill。`skillPath` 是其在来源内的稳定身份；frontmatter `name` 只用于展示和按名称选择。

## Source Intake Invariants

- Source intake 拥有来源解析、获取、Skill 发现和远程临时目录清理的完整生命周期。
- 远程来源在一次 intake 中固定为 clone snapshot；本地来源是 live view，不额外复制。
- Source intake 始终递归扫描完整来源树，跳过生成目录且不跟随符号链接；结果按 `skillPath` 确定性排序。
- 不同 `skillPath` 的同名 Skill 必须全部保留；非交互名称选择命中多个路径时必须报告歧义。
- 无效或越界的 Skill 作为结构化 issue 返回；来源获取或遍历失败属于致命错误。
- 回调结束后以 best-effort 清理远程临时目录；清理失败不得覆盖业务结果或原始错误。

### Prompt

一次阻塞式终端输入交互。Prompt 只负责终端输入机制，不负责命令级业务选择、持久化、日志结果或进度展示。

## Prompt Invariants

- 所有阻塞式用户输入通过唯一 Prompt facade；命令不直接依赖底层 prompt library 的取消值。
- Prompt 提交、取消或失败后必须恢复 raw mode、光标与事件监听器。
- 用户取消与非 TTY、调用配置错误、运行失败是不同结果；只有用户取消返回 Prompt cancel sentinel。
- message、label 与 hint 在输出前必须移除终端控制序列并规整为安全的单行显示文本；option value 不得被改变。
- Prompt 不决定领域选项的顺序、默认选择、验证、持久化或取消后的命令行为。
