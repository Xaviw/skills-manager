# 深化 Prompt module

## 状态

实现完成。

## 已验证现状

- `list-prompt.ts` 提供单选与多选列表，并自行管理 raw mode、keypress、重绘、终端宽度和取消值。
- `install.ts` 内嵌可编辑目标目录 prompt，重复管理 raw mode、keypress、重绘、终端宽度和光标。
- `prompt-format.ts` 负责 hint 规整与帮助文本输出，其中字符长度截断与列表 prompt 的显示宽度截断并不一致。
- `add`、`find`、`install`、`remove`、`update` 各自构造领域选项并处理取消；部分简单输入继续直接调用 `@clack/prompts`。
- `progress-spinner.ts` 同样操作终端光标与输出，但目前不属于 Prompt module。

## 待决问题

尚无。

## Decisions

1. Prompt module 只拥有通用终端交互机制，包括输入、单选、多选、取消语义、raw mode、重绘、宽度计算与资源清理。命令继续负责构造领域选项、业务流程和 i18n 文案。
2. 所有等待用户输入的操作都通过 Prompt module；命令不直接识别 `@clack/prompts` 的取消值。日志输出仍可直接使用 `@clack/prompts`，不新增通用输出 facade。
3. 取消通过 Prompt module 自有的唯一 sentinel 返回，并提供类型守卫。Prompt primitive 不记录取消日志、不调用 `process.exit()`；命令负责取消后的业务行为。
4. 目标目录不再使用列表项原位编辑器。交互改为先单选预设、历史目录或“自定义路径”；仅选择自定义路径时再进行文本输入。
5. 列表 prompt 优先委托已安装的 Clack `select` / `multiselect`，并统一限制可见项。实现前必须用可执行终端回归测试覆盖长列表、长文本与中文；仅当该测试证明 Clack 不满足时，才保留最小自绘 renderer。
6. Prompt module 仅公开 `textPrompt`、`selectPrompt`、`multiselectPrompt` 与 `isPromptCancel`。不新增 service、class、factory、renderer interface 或没有真实调用方的 primitive。
7. `selectPrompt` 与 `multiselectPrompt` 自动输出本地化按键帮助；命令不传 help 文案。`textPrompt` 不额外输出帮助。业务 message、label 与验证文案仍由命令提供。
8. Prompt module 在输出前统一移除 message、label、hint 中的终端控制序列、折叠为单行并按可见宽度截断；option 原始 value 不变。命令不再预先格式化 hint。
9. 命令在进入交互前处理非 TTY：可自动确定时走非交互流程，否则报告缺失参数。Prompt primitive 也拒绝在 stdin 或 stdout 非 TTY 时启动，且该情况不伪装成用户取消。
10. `Esc` 与 `Ctrl+C` 都返回 `promptCancel`。Prompt module 在提交、取消和失败路径都必须恢复 raw mode、光标与监听器；不额外接管进程信号。
11. 列表 options 不能为空、value 必须唯一，显式 initial value 必须存在于 options。违反约束时在进入 raw mode 前抛出调用错误，不返回取消或空选择。
12. `multiselectPrompt` 始终要求至少选择一项，不公开 `required` 开关。用户不提交选择时必须取消。
13. 命令提供 options 顺序与 initial value(s)，Prompt module 不排序。单选未指定初始值时使用第一项，多选未指定时为空；多选结果始终按 options 顺序返回。
14. `textPrompt` 返回用户原始字符串。验证与领域规整由命令负责，不新增 `trim` 等配置开关。
15. Progress spinner 不属于 Prompt module，继续保留在独立模块。命令必须结束 spinner 阶段后再启动 prompt，不新增全局终端协调器。
16. `src/prompt.ts` 是唯一公开 seam，命令只从该文件导入。默认不建立 `prompt/` 目录或 barrel；仅当 Clack 回归测试失败时才保留一个内部 renderer 文件。
17. Prompt module 测试通过受控 stdin/stdout 模拟 TTY并调用真实 Clack，覆盖公开行为；不新增 PTY 依赖，不把私有宽度 helper 作为测试 seam。命令测试只 mock Prompt facade。
18. 删除命令 options 中 `promptSelect`、`promptMultiselect`、`logPromptHelp` 等 Prompt 专用测试注入字段。命令直接调用 Prompt facade；其他非 Prompt 依赖注入不在本次范围。
19. 用户取消后，命令输出自己的本地化取消消息并正常返回，不调用 `process.exit(0)`。Prompt module 不负责业务取消文案。
20. 多选提交摘要有界：最多显示前三个 label，再显示剩余数量。该行为属于 renderer 验收条件。
21. 列表窗口只使用通用 `...` 表示仍有隐藏项，不计算上下隐藏数量，也不为该数量保留 i18n 文案。
22. 列表在首尾循环导航，与 Clack 原生行为保持一致，不提供命令级导航模式配置。
23. 列表最多显示 8 个选项，并按终端可用行数自动缩减。该值是 Prompt module 内部策略，不公开 `maxVisible/maxItems`。
24. 清洗后为空的 message 或 option label 属于调用错误，在进入 raw mode 前抛出；清洗后为空的 hint 直接省略。
25. 非 TTY 不为原本需要交互的命令推断默认值。`add`、`install`、`remove` 与 `find` 在信息不足时明确提示所需参数；`update` 保持既有自动更新语义。
26. 本次不新增终端渲染依赖。使用现有 Clack、picocolors 与 Node 标准库；若需要 fallback renderer，只保留验收所需的最小宽度逻辑。
27. Prompt module 不增加并发队列、锁或 active-session 状态；调用方必须顺序 `await` prompt。
28. 不保留旧 Prompt helper 的兼容导出。迁移完成后删除无调用的旧 helper、原位编辑实现及私有算法测试；fallback renderer 只能作为 facade 私有实现存在。
29. `install` 继续拥有目标目录历史的读取、排序、保存，以及 select 后按需 text 的流程。Prompt module 只消费调用方已构造的 options，不依赖 lock storage。
30. 底层 Prompt 运行失败时，Prompt module 完成终端清理后原样抛出；不重试、不返回取消、不在运行时自动切换 renderer。
31. `textPrompt` 与 `selectPrompt` 委托 Clack；仅 `multiselectPrompt` 保留满足有界提交摘要所需的最小内部 renderer。两种列表不要求使用同一个 renderer。
32. 自绘多选仅支持上下循环导航、Space 切换、A 全选/清空、Enter 提交、Esc/Ctrl+C 取消；不增加搜索、分页或可配置快捷键。
33. `add`、`find`、`install`、`remove`、`update` 在同一次实现中迁移到 Prompt facade，并删除旧入口。spinner 仅保持与 prompt 分阶段运行，不并入 Prompt module。

## 拟定公开 seam

```ts
textPrompt<T extends string = string>(options: TextPromptOptions): Promise<T | symbol>

selectPrompt<Value>(
  options: SelectPromptOptions<Value>,
): Promise<Value | symbol>

multiselectPrompt<Value>(
  options: MultiselectPromptOptions<Value>,
): Promise<Value[] | symbol>

isPromptCancel(value: unknown): boolean
```

具体类型在实现时以现有调用方的最小共同需求为准，不新增 service、factory 或 renderer interface。

## 实现验收

- 所有阻塞式输入只通过 `src/prompt.ts`。
- `textPrompt` 与 `selectPrompt` 使用 Clack；`multiselectPrompt` 只保留必要的最小 renderer。
- 非 TTY 不进入 raw mode；需要业务输入的命令给出参数错误，不推断默认操作。
- 长列表、长中文、控制序列、取消、失败清理、参数校验与结果顺序均在 Prompt 公开 seam 测试。
- 多选最多展示 8 项，首尾循环，提交摘要最多三个 label 加剩余数量。
- 目标目录改为“选择预设/历史/自定义；自定义时再文本输入”。
- 用户取消由命令输出本地化文案后正常返回。
- 不新增依赖，不并入 spinner，不保留旧 Prompt helper 兼容层。
- `mise exec -- pnpm check:all`、`mise exec -- pnpm test` 与 `mise exec -- pnpm build` 通过。
