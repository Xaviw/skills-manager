# 深化 Skill Group 与 add 覆盖

Triage: ready-for-agent
Status: completed

## Problem Statement

当前 CLI 将 Base Skill 主要按目录名平铺展示，用户无法快速判断多个 Managed Skill 属于哪个仓库。`add` 遇到已有目录时只按目录名判断冲突，即使新来源与现有 Managed Skill 是同一来源，也会要求用户重命名，导致同一 Skill 被复制成多个目录。

此外，旧 lock entry 可能缺少 `skillPath`。这类 entry 无法可靠识别 Managed Skill Identity，现有 `update` 也无法为它们恢复 tracking metadata。

## Solution

为 CLI 建立统一的 Skill Group 展示与选择模型：手动技能作为第一组，Managed Skill 按 Repository Identity 分组，组内按名称升序排列。交互式多选支持可选择的组行、三态显示和组内联动。

`add` 使用 Managed Skill Identity 判断重复来源。同一 Repository Identity 与同一 `skillPath` 的 Skill 直接复用原有目录并覆盖内容，即使来源中的展示名称已经变化；不同 `skillPath` 仍按目录冲突处理。

`update` 在无参数和显式名称模式下都尝试修复缺少 `skillPath` 的旧 entry。来源中按 `displayName` 大小写不敏感地唯一匹配时，重新安装当前内容并补齐 `skillPath` 与可用 tracking metadata；无法唯一匹配时不推断覆盖。

## User Stories

1. As a CLI user, I want `add` 的 Skill 按名称升序显示, so that I can scan and select them predictably.
2. As a CLI user, I want names to sort case-insensitively with natural numeric ordering, so that `skill-2` appears before `skill-10` and capitalization does not reorder peers unexpectedly.
3. As a CLI user, I want equal Skill names to have a stable `skillPath` tie-breaker, so that repeated runs present the same order.
4. As a CLI user, I want `list` to show Manual Skill first, so that locally maintained content is immediately distinguishable from repository content.
5. As a CLI user, I want Managed Skill grouped by Repository Identity, so that I can understand which Skills came from the same source.
6. As a CLI user, I want repository groups ordered by their display name, so that group navigation is predictable.
7. As a CLI user, I want each group’s Skills ordered by directory name, so that CLI names remain easy to scan and reuse.
8. As a CLI user, I want empty groups omitted, so that the output contains only actionable content.
9. As a CLI user, I want GitHub HTTPS, SSH, and shorthand inputs for one repository to appear in one group, so that URL spelling does not create duplicate groups.
10. As a CLI user, I want GitHub group labels to use canonical lowercase `owner/repo`, so that labels are stable across input capitalization.
11. As a CLI user, I want non-Git sources identified by their complete URL, so that the CLI does not incorrectly merge unrelated repositories.
12. As a CLI user, I want local sources identified by their resolved absolute source directory, so that equivalent local path spellings share one group.
13. As a CLI user, I want `install`, `remove`, and `update` selection lists to show the same grouping as `list`, so that commands use one consistent mental model.
14. As a CLI user, I want a group row to select or clear all of its Skills, so that I can manage a repository’s Skills with one action.
15. As a CLI user, I want a partially selected group to show a half-selected marker, so that the group state reflects its children without ambiguity.
16. As a CLI user, I want group state to update when I toggle a child Skill, so that parent and child selections never disagree.
17. As a CLI user, I want to navigate through group rows and child rows with the existing vertical navigation, so that group actions remain keyboard accessible.
18. As a CLI user, I want `Space` to toggle the focused group or Skill and `Enter` to submit, so that selection and submission have distinct meanings.
19. As a CLI user, I want `A` to select all Skills when any Skill is unselected and clear all when every Skill is selected, so that the existing global shortcut remains useful with groups.
20. As a CLI user, I want all groups expanded without a collapse mode, so that group membership is always visible while selecting.
21. As a CLI user, I want group rows and child rows to use three visual states (`○`, `◐`, `●`), so that the hierarchy is understandable in a plain terminal.
22. As a CLI user, I want a group’s child rows indented and groups separated by one blank line, so that the hierarchy is visually scannable.
23. As a CLI user, I want long grouped lists to retain the current visible-window behavior, so that the terminal remains usable at different heights.
24. As a CLI user, I want the current group context retained when a large group scrolls beyond the viewport, so that child Skills never lose their source context.
25. As a CLI user, I want `add` to overwrite an existing Skill from the same Repository Identity and `skillPath`, so that re-adding a Skill updates it instead of creating a renamed copy.
26. As a CLI user, I want a repository Skill whose upstream display name changed to keep its existing directory name, so that project installations and references do not break.
27. As a CLI user, I want two same-named Skills from different `skillPath` values in one repository to remain distinct, so that one source Skill cannot overwrite another.
28. As a CLI user, I want same-directory conflicts from a different Managed Skill Identity to retain the existing prompt or explicit-mode error, so that unrelated content is not silently replaced.
29. As a CLI user, I want old entries without `skillPath` to be repairable by `update`, so that existing tracking metadata can be brought up to date without manual lock editing.
30. As a CLI user, I want repair matching to be case-insensitive but exact, so that only an unambiguous source Skill is selected.
31. As a CLI user, I want repair to work for local, GitHub, and ordinary Git sources when the source can be acquired, so that the migration is not limited to one provider.
32. As a CLI user, I want a successful repair to reinstall current content and update metadata together, so that the directory and tracking state remain consistent.
33. As a CLI user, I want ambiguous or missing repair matches to be reported without guessing, so that an old entry cannot overwrite the wrong Skill.
34. As a CLI user, I want no-argument interactive `update` to include repair candidates selected by default, so that normal update workflows can repair old metadata.
35. As a CLI user, I want explicit `update <name>` repair failures to fail the command, so that automation can detect incomplete repairs.
36. As a CLI user, I want no-argument update failures to be reported per Skill while other Skills continue, so that one bad source does not cancel a batch.
37. As a CLI user, I want failed and skipped update lists to use the same repository grouping, so that result review is as clear as selection.

## Implementation Decisions

- Use the domain vocabulary `Repository Identity`, `Managed Skill Identity`, and `Skill Group` from the project context.
- Define `Managed Skill Identity` as `Repository Identity + skillPath`; `ref` changes the tracked version but does not change identity.
- Derive Repository Identity from `sourceUrl` at read/intake time rather than trusting the historical `source` display field.
- Normalize GitHub identities to case-insensitive lowercase `owner/repo`. Preserve complete non-GitHub Git URLs as distinct identities. Use resolved absolute local source directories for local identities.
- Treat Manual Skill as the single group for Base Skills without a lock entry. Manual Skill is always first when present. Repository groups follow in natural display-name order.
- Use natural, case-insensitive name comparison with numeric ordering. Sort add candidates by Source Skill display name and then `skillPath`; sort Base Skill listings by directory name and then a stable identity tie-breaker.
- Omit empty groups. A list containing no Base Skill continues to use the existing empty-state message.
- Keep command ownership of group ordering and business labels. Extend the existing multiselect option contract with an optional group display value; the Prompt module derives contiguous group rows without owning repository semantics.
- Keep add’s ungrouped Source Skill prompt flat. `install`, `remove`, and `update` provide group values on their options.
- Make group rows focusable. Vertical navigation includes group and child rows; group rows do not appear in the submitted Skill values.
- Use `○` for no selected children, `●` for all selected children, and `◐` for partial selection. `Space` toggles the focused row, `A` applies the existing global select-all/clear-all behavior, and `Enter` submits the current child selection.
- Keep all groups expanded. Insert one non-focusable blank line between groups. Count group and child rows toward the existing maximum of eight navigable rows; blank lines consume terminal height but not the logical item count.
- Retain group context when a large group scrolls beyond the viewport by keeping its group row visible with an omission marker. Preserve logical focus order independently of the pinned context rendering.
- Derive initial group states from child initial values. `add`, `install`, and normal `update` candidates begin fully selected; `remove` begins unselected.
- Apply grouping to every user-visible multi-Skill list: `list`, interactive selection lists, and `update` skipped/failed reports. Count-only success messages do not need group rendering.
- On add, first match selected Source Skills against existing Managed Skills by Managed Skill Identity. A match reuses the existing directory name and calls the normal atomic Managed Skill replacement flow.
- If the identity does not match, retain directory conflict behavior. Same repository with a different `skillPath` is not an overwrite match. A legacy entry with no `skillPath` is never inferred as a match by add.
- If more than one existing directory claims the same Managed Skill Identity, report a tracking conflict instead of selecting one silently.
- Keep the lock file version and shape compatible. `skillPath` remains optional for malformed or historical entries; no new schema field is required for this feature.
- Extend update’s source intake for entries without `skillPath`. Acquire local, GitHub, or ordinary Git sources, discover Skills, and match `displayName` case-insensitively and exactly.
- Only a unique match repairs an old entry. Zero matches and multiple matches remain unresolved and are reported without modifying the entry.
- A successful repair reinstalls current Skill content and writes the resolved `skillPath`, current hash when available, and normal timestamps through the existing per-Skill atomic commit.
- In no-argument update, unresolved repair candidates become skipped or failed results while other Skills continue. In explicit update mode, unresolved repair is a command failure.
- Include repairable candidates in the interactive no-argument update selection and select them by default. Non-interactive update processes all repairable candidates.
- Preserve the existing Source intake lifecycle, Base Skill atomicity, prompt cancellation semantics, and per-Skill batch behavior from the accepted Base Skill, Source intake, and Prompt ADRs.
- Do not add a prompt service, renderer abstraction, lock schema version, URL provider registry, fuzzy matching, or cross-provider repository inference.

## Testing Decisions

- Test observable command behavior and public Prompt behavior, not private row-building helpers or terminal implementation details.
- Use the existing controlled TTY tests at the Prompt facade seam to exercise group rendering and state transitions with real key input. Cover empty, partial, and full group states; child-to-parent and parent-to-child updates; global `A`; submit ordering; group spacing; and viewport context for large groups.
- Extend existing command tests to assert add option ordering by display name, stable tie-breaking, repository grouping, manual-first ordering, empty-group omission, and grouped update result output.
- Extend add command tests at the existing command seam to cover same-identity overwrite, upstream display-name changes preserving the old directory, different `skillPath` conflicts, cross-form GitHub identity matching, ref changes, and duplicate identity tracking conflicts.
- Extend update/source-intake orchestration tests to cover unique old-entry repair, case-insensitive matching, local/GitHub/ordinary Git repair, missing matches, ambiguous matches, interactive repair selection, and per-Skill continuation behavior.
- Reuse existing Base Skill tests for atomic replacement and metadata consistency; assert that add and update use that public commit behavior rather than duplicating filesystem assertions.
- Reuse existing source parser and Source intake tests for canonical GitHub identity, resolved local paths, complete non-GitHub URLs, and stable `skillPath` discovery.
- Add regression coverage for lock entries that lack `skillPath`, including no-argument and explicit update modes. Do not add tests that assume fuzzy name matching or infer a missing path from a directory name.
- Acceptance checks remain the repository baseline: full lint/format/type checks, the complete Vitest suite, build, and diff whitespace validation.

## Out of Scope

- No collapse/expand interaction, search filtering, pagination, configurable keyboard bindings, or new terminal dependencies.
- No canonicalization of non-GitHub Git URLs across protocols, host aliases, trailing `.git`, or other spellings.
- No inference that two non-GitHub URLs refer to the same remote repository.
- No fuzzy, similarity-based, directory-name-based, or content-hash-based repair matching for missing `skillPath`.
- No automatic repair of duplicate Managed Skill Identities by choosing a winner.
- No change to `ref` semantics, default-branch resolution, Source intake cleanup, Base Skill atomicity, progress spinner ownership, or project installation behavior.
- No changes to Manual Skill storage or conversion of Manual Skill into Managed Skill.
- No new lock version or mandatory migration command separate from `update`.
- No changes to `.codex/` files or formatting rules.

## Further Notes

- `skillPath` has existed since the initial `v0.1.0` lock model; repair is for incomplete or malformed entries rather than a new schema migration introduced by this feature.
- Repository groups can contain Skills tracked at different refs because ref is deliberately excluded from Managed Skill Identity. Update source acquisition may still remain separate when refs differ.
- Group display labels must continue through the Prompt display-text sanitization path; option values and tracking identities remain unchanged.
- The confirmed test seams are the public multiselect Prompt seam plus existing command orchestration seams. No additional service seam is expected.
