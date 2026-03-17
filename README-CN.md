# skls-mgr

[English](./README.md)

单目录下集中维护 Agent Skills；不同项目按需安装；一处修改，自动同步。

## 为什么不是 [vercel-labs/skills](https://github.com/vercel-labs/skills)

本项目受 [`vercel-labs/skills`](https://github.com/vercel-labs/skills) 启发，感谢 Vercel Labs 团队对 Agent 生态的贡献。

`vercel-labs/skills` 使用情景：

- 全局安装：技能安装到 `~/.agents/skills`，软链到其他工具全局技能目录，例如 `~/.claude/skills`。
- 项目安装：技能安装到 `./.agents/skills`，软链到其他工具项目技能目录，例如 `./.claude/skills`。
- 安装本地技能：复制本地技能到全局或项目中的 `.agents/skills` 中，软链到其他工具的全局或项目技能目录。
- 以项目级别重复安装同一个技能时，需要重复使用 `add` 命令，重复创建技能文件。

`skls-mgr` 使用情景：

- 技能统一安装到 `~/.config/skls-mgr`。
- 按需软链到全局或项目的任意工具技能目录下，例如 `~/.claude/skills`。
- 本地技能直接放在 `~/.config/skls-mgr` 目录下即可统一管理。
- 以项目级别重复安装同一个技能时，使用 `install` 命令从收集的技能中按需软链，无需重复 `add` 命令，无需重复创建技能文件。

`skls-mgr` 简化了对技能的管理流程，统一维护，按需软链。

## 快速开始

在 [skills.sh](https://skills.sh/) 中查找目标技能，将安装命令中的 skills 改为 skls-mgr：

```bash
npx skls-mgr add https://github.com/vercel-labs/skills --skill find-skills
```

安装完成后，技能会被复制到 `~/.config/skls-mgr` 目录，随后在任意项目中执行：

```bash
npx skls-mgr install
```

交互式选择项目所需技能，确定后安装完成。

## 添加技能

```bash
npx skls-mgr add <source>
```

默认会进入交互式界面，列出来源包含的全部技能。

### 选项

| 选项                     | 说明                                 |
| ------------------------ | ------------------------------------ |
| `-s, --skill <names...>` | 直接指定要安装的技能名，跳过技能选择 |

### 示例

```bash
# GitHub shorthand（owner/repo）
npx skls-mgr add vercel-labs/skills

# GitHub 仓库 URL
npx skls-mgr add https://github.com/vercel-labs/skills

# GitHub 仓库中的子路径
npx skls-mgr add https://github.com/vercel-labs/skills/tree/main/skills/find-skills

# 任意 Git URL
npx skls-mgr add https://github.com/vercel-labs/skills.git
npx skls-mgr add git@github.com:vercel-labs/skills.git

# 本地路径（复制）
npx skls-mgr add ./my-local-skills

# 安装指定技能（重复写 --skill）
npx skls-mgr add vercel-labs/agent-skills --skill frontend-design --skill skill-creator

# 安装指定技能（单个 --skill 后跟多个名称）
npx skls-mgr add vercel-labs/agent-skills --skill frontend-design skill-creator
```

### 冲突处理

如果待安装技能的目录名和 `~/.config/skls-mgr` 中已有一级目录重名：

- 交互模式下，会要求你输入新的目录名
- 非交互模式下，如果使用了 `--skill`，命令会直接终止，不会自动改名

## 安装到项目

```bash
npx skls-mgr install
```

默认会进入交互式界面，列出 `~/.config/skls-mgr` 下全部一级目录（包括手动创建的技能）。

### 选项

| 选项               | 说明                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `-a, --all`        | 安装全部技能，未指定时支持交互式选择所需技能                           |
| `-d, --dir <path>` | 安装到目标目录，支持相对路径或绝对路径，未指定时支持交互式输入目标目录 |
| `-l, --link`       | 使用符号链接，未指定时支持交互式选择使用符号链接或复制方式             |
| `-c, --copy`       | 使用复制方式，未指定时支持交互式选择使用符号链接或复制方式             |

### 示例

```bash
# 交互式安装到项目
npx skls-mgr install

# 将所有技能复制到 Claude Code 技能目录
npx skls-mgr install --all --dir ./.claude/skills --copy

# 交互式选择所需技能，链接到 .agents/skills 目录
# 参数支持自由组合，未传递的参数通过交互式选择
npx skls-mgr install --dir ./.agents/skills --link
```

### 覆盖策略

如果目标目录下已存在同名技能目录，`skls-mgr install` 会直接覆盖，不再额外确认。

当选择 `--link` 时，如果当前环境无法创建符号链接，会自动回退为复制安装。

## 其他命令

| 命令                             | 说明                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| `npx skls-mgr list`              | 列出 `~/.config/skls-mgr` 中的全部技能，支持区分托管技能与手动技能 |
| `npx skls-mgr update [names...]` | 交互式或根据指定名称更新技能                                       |
| `npx skls-mgr remove [names...]` | 交互式或根据指定名称删除技能                                       |
| `npx skls-mgr help`              | 显示帮助                                                           |
| `npx skls-mgr version`           | 显示版本                                                           |

### 示例

```bash
# 显示全部技能（包括手动添加技能）
npx skls-mgr list

# 交互式更新技能
npx skls-mgr update

# 按名称强制更新技能
npx skls-mgr update skill1 skill2

# 交互式删除技能
npx skls-mgr remove

# 按名称删除技能
npx skls-mgr remove skill1 skill2

# 显示帮助
npx skls-mgr help

# 显示版本
npx skls-mgr version
```

> `skls-mgr update` 依赖 GitHub API。为避免匿名请求带来的限流限制（每小时 60 次），建议在环境变量中配置 `GITHUB_TOKEN` 或 `GH_TOKEN` 以提升配额（每小时 5000 次）。

## License

MIT
