# PRD：按需管理 Skill CLI（v1.0.0）

> 文档状态：基于近 6 轮讨论整理；忽略现有 `skls-mgr` 实现；项目名待定（避免与 `Rito-w/skills-manager` 撞名）。
> 适用范围：本仓库 `v1.0.0` 分支起的全新实现。

---

## 1. 背景

`vercel-labs/skills`（二进制名 `skills`，npm 包名 `skills`）已是 agent skill 分发的事实标准，但它**只支持两种安装范围**：

| Scope | Location |
|---|---|
| Project（默认） | `./<agent>/skills/` |
| Global（`-g`） | `~/<agent>/skills/` |

社区已有 2 个未合并 issue 请求"自定义安装路径"（[#222](https://github.com/vercel-labs/skills/issues/222)、[#650](https://github.com/vercel-labs/skills/issues/650)），短期内不会原生支持。

同类项目 `luongnv89/asm` 已实现 library + 任意路径激活理念，但**命令面不兼容** `vercel-labs/skills`。

## 2. 目标

提供一个 **CLI 命令面与 `vercel-labs/skills` 完全一致** 的 skill 管理器，把 `add` / `remove` / `list` / `update` 的写入位置从 agent 目录劫持到独立 library，并额外提供 `install` 命令实现"从 library 部署到任意目标路径"。

**核心用户行为**：

```bash
# 之前（vercel-labs/skills 直接用）
skills add vercel-labs/agent-skills
skills list
skills install vercel-labs/agent-skills    # 实际 = add 别名

# 之后（仅替换二进制名）
<cli> add vercel-labs/agent-skills         # 写到 library，不污染 ~/.agents/skills
<cli> list                                # 列 library
<cli> install                             # 从 library 部署到任意目标（独有语义）
```

## 3. 用户场景

1. **多项目复用**：同一批 skill 装到 library，每个项目用 `<cli> install -d ./claude/skills` 部署
2. **机器间迁移**：把 `~/.config/<cli>/` 整目录拷到新机器即恢复全部 skill
3. **自定义 agent 目录**：构建私有 agent 工具的用户可部署到任意路径
4. **不污染项目根**：用户 `cd ~/proj && <cli> add foo` 不会在项目里产生 `<agent>/skills/`

## 4. 命令面

### 4.1 完整命令列表

| 命令 | 来源 | 实现策略 |
|---|---|---|
| `add <source>` | vercel-labs/skills | spawn 到 staging 后搬运 |
| `remove [skills...]` | vercel-labs/skills | 自实现（删 library） |
| `list` | vercel-labs/skills | 自实现（扫 library） |
| `update [skills...]` | vercel-labs/skills | spawn（重跑 add） |
| `find [query]` | vercel-labs/skills | 透传（stdio inherit） |
| `use <source>[@skill]` | vercel-labs/skills | 透传（stdio inherit） |
| `init [name]` | vercel-labs/skills | 透传（stdio inherit） |
| `install` | **本项目独有** | 自实现（library → 目标路径） |
| `help` / `--help` / `-h` | 本项目 | 自实现 |
| `--version` / `-v` | 本项目 | 自实现 |

### 4.2 add

```bash
<cli> add <source> [flags]
```

**行为**：

1. 创建临时目录 `staging = mkdtemp(<base>/_staging-XXXX)`
2. `cwd=staging` 下 spawn `skills add <source> <透传 flags> --copy -y -a claude-code`
3. 用 `discoverSkills(staging, { fullDepth: true })` 扫出所有 skill 目录
4. 对每个 skill：cp 到 `library/<skill>/`，写 `.source.json`，更新 `.skill-lock.json`
5. 删除 staging
6. 输出：`✓ <skill> → ~/.config/<cli>/library/<skill>/`

**透传 flags**：`--skill -s` / `--list -l` / `--yes -y` / `--all` / `--full-depth` / `--metadata` / `--subagent`

**降级为元数据**：`--global -g`（记录 `scope`，不影响路径）/ `--agent -a`（记录 `targetAgents`，不影响路径）

**强制覆盖**：用户传的 `--copy` 内部强制生效

**前置依赖**：`which skills` 检测，缺失则报错并提示 `npm i -g skills`

### 4.3 remove

```bash
<cli> remove [skills...]           # 同 rm / r 别名
<cli> remove --all -y
<cli> remove -s foo -s bar -y
```

**行为**：从 `library/<skill>/` 删除条目 + 从 `.skill-lock.json` 移除记录。

**flag**：`--all -a`（全部，等价 `-s '*'`）/ `--yes -y`（跳过确认）

**注**：不区分 project/global；vercel-labs/skills 的 `-g` 在本项目无意义，忽略。

### 4.4 list

```bash
<cli> list [-g] [--json]
<cli> ls -a claude-code
```

**行为**：扫 `library/`，输出表：`name | source | addedAt | installedAt | size`

**flag**：

- `-g --global`：忽略（library 唯一，无 scope 概念）
- `-a --agent`：过滤 skill 的元数据 `targetAgents`
- `--json`：JSON 输出

### 4.5 update

```bash
<cli> update [skills...] [-g] [-p] [-y]
```

**行为**：

- 对每个 skill：读 `.source.json` 中的 `source`，重跑 add 流程（覆盖 library 条目）
- 更新 `.skill-lock.json` 中的 `updatedAt` 和 `ref`

**flag**：

- `-g --global`：忽略
- `-p --project`：忽略
- `-y --yes`：跳过确认

### 4.6 find / use / init

全部 `stdio: 'inherit'` 透传给 `skills <cmd> [args...]`，本项目不解析输出。

### 4.7 install（本项目独有）

```bash
<cli> install                              # 交互式
<cli> install -s foo -s bar                # 指定 skill
<cli> install -a                           # 全部
<cli> install -d ./claude/skills           # 指定目标路径
<cli> install -l                           # symlink 模式
<cli> install -c                           # copy 模式
<cli> install -a -d ./agents/skills -c -y  # 全部常用组合
```

**行为**：

1. 从 `library/` 读取 skill 列表
2. 按 `-s/-a` 过滤（无参数则交互选 skill）
3. 按 `-d` 取目标路径（无参数则交互选；保存过的自定义路径进快捷列表）
4. 按 `-l/-c` 取模式（无参数则交互选）
5. 在目标路径执行 copy 或 symlink
6. 输出：`✓ <skill> → <target>/<skill>/`

**强约束**：`install` **不接受 source 参数**（避免与 vercel-labs/skills `install` 别名混淆）。source 走 `add`。

**保留的 flag**（沿用当前 `skls-mgr install` 的语义）：

- `-s --skill <name>`：可重复
- `-a --all`：全部
- `-d --dir <path>`：目标路径，支持 `~/` 展开
- `-l --link`：symlink
- `-c --copy`：copy

**非交互模式**：`-d` + `-s/-a` + `-l/-c` 同时存在时跳过所有提示。

## 5. 操作目录结构

```
~/.config/<cli>/
├── library/                            # add 写入位置
│   ├── <skill-a>/
│   │   ├── SKILL.md
│   │   ├── .source.json                # {source, sourceType, ref, scope, targetAgents, addedAt, updatedAt}
│   │   └── ...附属文件
│   └── <skill-b>/
├── active/                             # install 默认落点（可选，用户也可用 -d 指定）
├── .skill-lock.json                    # 兼容 vercel-labs/skills SkillLockFile schema
├── saved-targets.json                  # 用户保存的自定义 install 目标
└── config.json                         # 全局配置
```

**项目名（决定 `~/.config/<cli>/` 的 `<cli>`）待定**，候选：

- `skls`（短，4 字符）
- `skls-mgr`（沿用旧名）
- `lib-skills`
- `skill-keeper`

需避免与 `Rito-w/skills-manager` 撞 npm 名。

## 6. 关键决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 包/二进制名 | `skls`（推荐） | 短、避撞名 |
| 与 vercel-labs/skills 命令兼容度 | 100% 兼容命令名 + flag 名 | 用户核心需求 |
| source 解析实现 | spawn 透传 vercel-labs/skills | 自动同步上游新 source 格式 |
| list/remove 实现 | 自实现，扫 library | vercel-labs/skills 不认 library 路径 |
| 依赖 vercel-labs/skills | 强依赖（运行时需全局装 `skills`） | 简化实现，自动同步 |
| 缺失 `skills` 时行为 | 启动检测 + 友好报错 + 安装指引 | — |
| 与 `asm` 关系 | 不对齐命令格式 | `asm` 已走自己的路 |
| TUI / bundle / audit / 安全扫描 | 不做 | YAGNI；保持范围聚焦 |

## 7. 非目标（v1 不做）

- TUI 交互界面
- bundle / collection 管理
- registry / 搜索索引
- 安全扫描、token 统计
- 自动检测已安装 agent
- 私有 skill 仓库认证（依赖 vercel-labs/skills 已有的能力）
- 多源并发 add（一次 add 一个 source）

## 8. 验收标准

### 8.1 功能

- [ ] `<cli> add owner/repo` 后，`library/<skill>/` 存在且包含 SKILL.md
- [ ] `<cli> add owner/repo` 后，用户 `~/.agents/skills`、`<cwd>/<agent>/skills/` **无新增条目**
- [ ] `<cli> list` 列出 library 内全部 skill，含 source 元数据
- [ ] `<cli> remove foo` 后 `library/foo/` 不存在
- [ ] `<cli> update foo` 后 `library/foo/` 的 `updatedAt` 更新，文件被覆盖为最新
- [ ] `<cli> install -s foo -d ./x -c` 后 `./x/foo/` 存在完整文件
- [ ] `<cli> install -s foo -d ./x -l` 后 `./x/foo` 是指向 `library/foo/` 的符号链接
- [ ] `<cli> find react` 与 `skills find react` 输出完全一致
- [ ] `<cli> use owner/repo@foo` 与 `skills use owner/repo@foo` 输出完全一致
- [ ] `<cli> init my-skill` 与 `skills init my-skill` 产出相同

### 8.2 隔离

- [ ] staging 目录在 add 结束后被删除（不残留）
- [ ] 用户 cwd 下不会产生 `<agent>/skills/` 子目录
- [ ] spawn 失败的 stderr 透传给用户

### 8.3 错误处理

- [ ] 全局未装 `skills` 时启动报错 + 指引
- [ ] add 一个不存在的 source 时，spawn 错误透传 + 不污染 library
- [ ] install 一个 library 中不存在的 skill 时报错
- [ ] 临时目录创建失败时优雅降级（重试或换 `os.tmpdir()`）

### 8.4 兼容性

- [ ] 所有 vercel-labs/skills 支持的 source 格式（GitHub shorthand、完整 URL、GitLab、tar/zip、private repo）自动可用
- [ ] vercel-labs/skills 升级后无需修改本项目即可继续工作

---

## 9. 待定事项

| 待定 | 决策点 | 建议默认 |
|---|---|---|
| 项目名 | 避免撞名 | `skls` |
| 包管理器 | 与上游一致 | `pnpm` |
| Node 版本 | Node 22+ | `>=22` |
| 测试框架 | 与 vercel-labs/skills 一致便于参考 | `vitest` |
| CI | 与上游 GitHub Actions 一致 | GitHub Actions |
| 文档 | 双语 | 中英文 README |