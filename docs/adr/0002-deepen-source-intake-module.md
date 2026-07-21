# ADR-0002：深化 Source intake module

- 状态：Accepted
- 日期：2026-07-20

## Context

`add.ts` 与 `update.ts` 分别组合来源解析、Git clone、本地目录读取、Skill 发现、相对路径计算和临时目录清理。这导致调用方可以遗漏清理，也让非默认分支信息在首次安装后丢失。现有发现逻辑还会在优先目录命中后停止递归，并按名称静默去重。

当前 `github | git | local` 类型同时表达获取方式和托管平台：GitHub HTTPS 与 SSH URL 会得到不同类型，但都可能使用 GitHub API。Source intake 需要提供稳定的来源模型，而不是继续暴露这些零散步骤。

## Decision

深化 Source intake module，由它拥有“来源输入转换为可消费 Skill 清单”的完整生命周期：

```ts
type SourceDescriptor =
  | {
      kind: 'local';
      localPath: string;
      subpath?: string;
    }
  | {
      kind: 'git';
      url: string;
      ref?: string;
      subpath?: string;
      githubRepo?: string;
    };

interface SourceSkill {
  name: string;
  description: string;
  path: string;
  skillPath: string;
}

interface SourceIssue {
  code: 'unreadable-skill' | 'invalid-skill' | 'outside-source';
  skillPath: string;
}

interface SourceSnapshot {
  source: SourceDescriptor;
  skills: SourceSkill[];
  issues: SourceIssue[];
}

withSource<T>(
  input: string | SourceDescriptor,
  consume: (snapshot: SourceSnapshot) => Promise<T>,
): Promise<T>
```

具体约束：

- 命令不再直接组合 parser、clone、discovery 和 cleanup。
- Source intake 不负责 Skill 筛选、交互、安装、日志或 GitHub 版本 hash。
- 远程来源在 callback 期间使用同一个临时 clone；本地来源直接读取原目录，是 live view。
- callback 返回或抛错后，以 best-effort 清理远程临时目录。清理错误不改变成功结果，也不覆盖原始错误。
- callback 内不得调用 `process.exit()`；命令必须在 Source intake 完成清理后处理退出状态。
- `kind` 只区分 local 与 git；`githubRepo` 表达 GitHub provider 能力。

### 来源身份

- 远程 Skill 的可重现身份是 repository URL、可选 ref 与 repository-root-relative `skillPath`。
- 用户显式指定 ref 时，add、hash 检查和 update 必须始终使用同一 ref。
- 未指定 ref 表示跟踪仓库当前默认分支，不猜测 `main/master`，也不把解析出的默认分支固化到 tracking metadata。
- lock version 继续保持 v1；entry 新增可选 `sourceRef`。旧 entry 缺少该字段时按当前默认分支处理，不猜测已经丢失的 ref。
- GitHub `tree` URL 的第一个路径段解释为 ref，其余部分解释为 subpath；URL 输入暂不支持包含 `/` 的 ref，不执行远程消歧。
- `foo/bar` 始终是 GitHub shorthand；本地相对路径必须以 `./`、`../` 或 `~/` 开头。绝对路径、Windows drive path 与 UNC path 是本地来源。

### Skill 发现

- 从 subpath 或来源根目录开始递归扫描完整目录树，不设置人为深度上限。
- 跳过 `.git`、`node_modules`、`dist`、`build` 与 `__pycache__`，且不跟随符号链接。
- Skill 目录与 `SKILL.md` 的 realpath 必须位于来源根目录内；越界候选返回 `outside-source` issue。
- `SKILL.md` frontmatter 的 `name` 与 `description` 必须是非空字符串，并只做首尾空白清理。
- 无法读取或无效的 manifest 不进入 Skill 清单，分别返回稳定 issue code；Source intake 不直接做 i18n 或日志输出。
- 不同 `skillPath` 的同名 Skill 全部保留，结果按规范化 `skillPath` 确定性升序排列。
- 非交互名称选择保持大小写不敏感；命中多个路径时报告歧义。交互选择使用 `skillPath` 作为内部 value。

### Update 编排

- `update` 按 `kind + repository URL/local path + ref` 分组，每组只调用一次 `withSource`，不增加跨调用缓存。
- 同一来源组中的 Skill 仍分别调用 Base Skill commit，保持 per-Skill atomicity。
- 来源组获取失败时，该组各 Skill 分别失败，不影响其他来源组。
- 无名称的自动 update 只检查具备 GitHub hash tracking 的 Skill。
- 显式 `update <names...>` 是强制重新获取，可用于 local、普通 Git 和 GitHub 来源，不以 hash 是否存在作为前置条件。
- GitHub adapter 按 `githubRepo + ref/default branch` 批量获取一次 recursive tree，并为同组所有 `skillPath` 返回 folder hash。

## Consequences

- 新增 Source intake facade；parser、Git 与 discovery 可继续作为低层 helper/adapter 存在，但不再由命令直接组合。
- Source intake 公开 seam 测试覆盖获取、发现、排序、issue、ref 重放、清理和路径 containment；命令测试只验证选择、分组与安装编排。
- GitHub adapter 单独测试显式 ref、实际默认分支与批量 folder hash。
- 本决策不处理 Skill payload 内部符号链接的复制策略；该安全边界属于 Base/filesystem module，需要单独跟踪。
