# ADR-0003：深化 Prompt module

- 状态：Accepted
- 日期：2026-07-20

## Context

阻塞式终端输入目前分散在 `list-prompt.ts`、`prompt-format.ts`、`install.ts` 与各命令中。列表与目标目录编辑器分别管理 raw mode、keypress、重绘、宽度和清理；命令同时依赖自定义取消值与 Clack 取消值，并重复输出按键帮助、格式化 hint 和注入 prompt 测试依赖。

目标目录原位编辑器占用大量专用终端代码。现有 Clack 已覆盖文本与单选；多选仍需要有界提交摘要，不能直接接受 Clack 输出全部已选 label 的行为。

## Decision

深化 Prompt module，以单个 `src/prompt.ts` 作为所有阻塞式用户输入的唯一公开 seam：

```ts
textPrompt(...)
selectPrompt(...)
multiselectPrompt(...)
isPromptCancel(...)
```

具体约束：

- Prompt module 只拥有输入、取消、终端生命周期、显示文本安全处理和通用按键帮助；命令拥有业务 message、options、默认选择、验证、持久化和取消后的行为。
- 命令可继续直接使用 Clack 日志；progress spinner 保持独立，且必须在 prompt 启动前停止。
- `textPrompt` 与 `selectPrompt` 委托现有 Clack；`multiselectPrompt` 使用满足既有有界摘要要求的最小内部 renderer。
- 不新增 prompt service、factory、session、renderer interface、并发队列或全局锁，也不新增终端依赖。
- `Esc` 与 `Ctrl+C` 返回同一个 module-owned cancel sentinel。Prompt 不记录取消日志、不调用 `process.exit()`。
- 提交、取消和失败路径都必须恢复 raw mode、光标与监听器；runtime failure 清理后原样传播，不重试或伪装成取消。
- stdin 或 stdout 非 TTY 时不得启动 prompt。命令不能据此猜测全选、目标目录或安装模式，信息不足时必须报告对应参数要求。
- message 与 label 清洗后必须非空；空 hint 被省略。所有显示文本移除终端控制序列、折叠为单行并按可见宽度限制，option value 保持原样。
- 列表 options 必须非空且 value 唯一；显式 initial value 必须存在。无效配置在进入 raw mode 前失败。
- 命令决定 options 顺序和 initial value(s)。单选缺省聚焦第一项，多选缺省为空；多选始终要求至少一项，并按 options 顺序返回结果。
- 列表最多显示 8 项并受终端行数约束，使用 `...` 表示隐藏项。导航首尾循环。
- 多选仅支持上下导航、Space 切换、A 全选/清空、Enter 提交与 Esc/Ctrl+C 取消；提交摘要最多显示三个 label 和剩余数量。
- `textPrompt` 返回原始输入；trim、验证和其他领域规整由命令负责。

### 目标目录流程

删除列表项原位编辑交互。`install` 继续拥有目标目录历史的读取与保存，先通过单选选择预设、历史目录或“自定义路径”，仅选择自定义路径时再调用文本输入。Prompt module 不读取 lock storage。

### 迁移与测试

- `add`、`find`、`install`、`remove`、`update` 在同一次变更中迁移到 facade。
- 删除 Prompt 专用 dependency injection、旧 helper 兼容导出及不再适用的私有算法测试；其他依赖注入不在本次范围。
- Prompt 测试在公开 seam 使用受控 stdin/stdout 模拟 TTY并调用真实 Clack，不新增 PTY 依赖。
- 回归覆盖长列表、长中文、控制序列、取消、清理、非 TTY、配置校验和确定性结果。
- 用户取消后由命令输出本地化消息并正常返回，不调用 `process.exit(0)`。

## Consequences

- 命令不再直接调用 Clack 的 text/select/multiselect 或识别其 cancel symbol。
- `prompt-format.ts`、旧列表公开入口和 `install.ts` 内的原位编辑器在无调用后删除；多选 renderer 仅作为 Prompt facade 的内部实现存在。
- Prompt module 依赖 i18n 仅用于通用按键帮助和通用交互状态，不吸收领域文案。
- 本决策不引入搜索过滤、分页、可配置键位、并发 prompt 或统一 Terminal UI module。
