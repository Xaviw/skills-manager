# ADR-0001：深化 Base Skill module

- 状态：Accepted
- 日期：2026-07-20

## Context

Base Skill 的实际目录与 lock tracking metadata 目前分散在 `base-dir.ts`、`skill-lock.ts` 和命令 module 中。`update.ts` 直接读写完整 lock，并复制时间戳规则；目录替换与 lock 写入任一步失败，都可能让两份状态分离。

Base Skill 的实际目录决定 Skill 是否存在。Managed Skill 是拥有 tracking metadata 的 Base Skill，而不是独立的存储实体。

## Decision

深化 Base Skill module，由它拥有 Base Skill 目录与 tracking metadata 的一致性。它的 interface 只包含：

```ts
listBaseSkills(): Promise<BaseSkillInfo[]>

installManagedSkill(
  sourceDir: string,
  directoryName: string,
  tracking: ManagedSkillTracking,
): Promise<void>

removeBaseSkill(directoryName: string): Promise<void>
```

具体约束：

- 单个 Managed Skill 采用 per-Skill atomicity；批量操作不提供 all-or-nothing。
- 批量更新可以并发 prepare，但必须串行 commit，避免 lock lost update。
- lock 使用临时文件加 rename 提交。
- 进程内可捕获错误必须回滚该 Skill 的目录与 tracking metadata。
- 若回滚本身失败，保留 backup 并在错误中报告恢复路径。
- 不提供 transaction journal，也不承诺断电或强制终止后的自动恢复。
- 保持 `.skls-mgr-lock.json` version 1、文件路径和 JSON shape 兼容。
- stale metadata 在读取时忽略但保留，不自动删除。

`skill-lock.ts` 收缩为原子读写 storage adapter。install target directory 偏好可以继续使用该 adapter，但不属于 Base Skill module。

以下 implementation 留在 seam 外：

- 将 Base Skill copy/link 到项目。
- install target directory 偏好。
- GitHub token、revision 查询和 Source intake。
- CLI prompt、日志与进度展示。

## Consequences

- `add`、`update` 和 `remove` 命令不再直接组合目录操作与 raw lock 写入。
- `hasBaseSkillDirectory`、raw `readSkillLock` / `writeSkillLock` 不属于命令可见 interface。
- Base Skill module 的测试 surface 覆盖目录 authority、成功提交、替换回滚、移除回滚及并发提交。
- storage adapter 的测试只覆盖 JSON 兼容、规范化和原子写入。
- 现有 update 集成测试保留；命令测试只验证选择、提示和结果编排。
