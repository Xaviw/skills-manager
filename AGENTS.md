# AGENTS.md

本文件用于为进入本仓库协作的 Agent 提供项目级约束。除非用户明确要求，否则默认使用中文交流与说明。

## 项目定位

`skls-mgr` 是一个 Node.js CLI，用于在本地统一维护 Agent Skills，并按需安装到不同项目中。

- 运行时：Node.js `>=22`
- 语言：TypeScript
- 模块系统：ESM（`"type": "module"`）
- 包管理器：`pnpm`

## 常用命令

```bash
pnpm dev -- list
pnpm dev -- add <source>
pnpm dev -- install
pnpm lint
pnpm format:check
pnpm check
pnpm check:all
pnpm test
pnpm build
pnpm prepublishOnly
```

补充说明：

- 本地开发入口：`node --import tsx src/cli.ts <command> [args]`
- `pnpm check`：基于 `lint-staged` 仅检查已暂存文件，供 `pre-commit` hook 使用
- `pnpm check:all`：执行整仓库 `lint + format:check + type-check`
- 发布前校验基线：`pnpm prepublishOnly`，等价于 `pnpm check:all && pnpm test`

## 目录结构

```text
bin/              CLI 启动脚本
src/              核心源码
tests/            Vitest 测试
dist/             构建输出
eslint.config.mjs ESLint v9 flat config
.prettierrc.json  Prettier 配置
README.md         英文说明
README-CN.md      中文说明
```

`src/` 中的主要文件：

- `cli.ts`：CLI 入口与命令分发
- `add.ts` / `install.ts` / `list.ts` / `update.ts` / `remove.ts`：命令实现
- `skills.ts` / `skill-lock.ts` / `source-parser.ts` / `git.ts`：核心业务逻辑
- `filesystem.ts` / `paths.ts` / `base-dir.ts`：文件系统与路径处理
- `i18n.ts` / `prompt-format.ts` / `constants.ts` / `types.ts`：共享基础设施

## 编码约定

- 保持 TypeScript 严格模式兼容，不要引入会破坏 `pnpm type-check` 的修改。
- 源码采用 ESM 导入，仓库内源码导入路径保持 `.js` 后缀风格。
- 延续现有风格：
  - 2 空格缩进
  - 单引号
  - 语句末尾分号
  - 多行对象、数组、参数列表保留尾随逗号
- 代码风格由 ESLint v9 flat config + `neostandard` + Prettier 共同约束：
  - ESLint 负责代码质量与基础规范
  - Prettier 负责格式统一
  - ignore 规则默认与 `.gitignore` 对齐
- 注释保持克制，仅在逻辑不直观时补充简短说明。
- 除非用户明确要求，不要把 `dist/` 作为主要修改目标；源码以 `src/` 为准。

## 测试与验证

- 涉及逻辑变更时，至少运行相关测试。
- 若改动影响命令行为、类型或公共流程，优先运行：

```bash
pnpm check:all
pnpm test
```

- 若只修改提交中的局部文件并需要验证 hook 行为，可运行：

```bash
pnpm check
```

- 如果因为环境限制、依赖缺失或用户要求而未执行验证，需要在最终说明中明确指出。

## 提交与 Hook

- 仓库已接入 `simple-git-hooks`。
- 当前 `pre-commit` hook 执行 `pnpm check`。
- `pnpm check` 使用 `lint-staged` 仅校验已暂存文件，不应把整仓库检查误写进提交钩子。

## 协作约束

- 先阅读局部上下文，再修改代码，避免基于猜测重构。
- 不要回退或覆盖用户已有的未授权变更。
- 优先做最小必要修改，避免无关重排。
- 发现工作区脏状态时，默认与现有修改共存，除非用户明确要求清理。
- 新增文档或命令示例时，优先与 `README.md` 和 `README-CN.md` 保持一致；若用户明确要求不修改 README，则遵循用户要求。

## 文档与输出

- 默认使用中文回复用户。
- 修改代码时，说明应聚焦结果、风险、验证情况，不写空泛总结。
- 如果用户要求评审，优先给出问题列表、风险等级和定位，再给摘要。
