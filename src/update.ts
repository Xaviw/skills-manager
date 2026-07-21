import * as p from '@clack/prompts';
import { isAbsolute } from 'path';
import { installManagedSkill, listBaseSkills } from './base-dir.js';
import { fetchSkillFolderHashes, getGitHubToken } from './github.js';
import { t } from './i18n.js';
import { isPromptCancel, multiselectPrompt } from './prompt.js';
import { getGitHubRepository, groupManagedItems } from './skill-groups.js';
import {
  createProgressSpinner,
  type ProgressSpinner,
} from './progress-spinner.js';
import { withSource } from './source-intake.js';
import type { ManagedSkillLockEntry, SourceDescriptor } from './types.js';

const DEFAULT_UPDATE_CHECK_CONCURRENCY = 4;
const DEFAULT_UPDATE_INSTALL_CONCURRENCY = 2;

interface UpdateItem {
  directoryName: string;
  entry: ManagedSkillLockEntry;
  latestHash: string;
}

interface UpdateInstallResult {
  directoryName: string;
  outcome: 'success' | 'failure';
  reason?: string;
}

interface NamedReason {
  directoryName: string;
  entry: ManagedSkillLockEntry;
  reason: string;
}

function getSkipReason(entry: ManagedSkillLockEntry): string {
  if (entry.sourceType === 'local') {
    return t('localPath');
  }
  if (entry.sourceType === 'git') {
    return t('gitUrlHashTrackingUnsupported');
  }
  if (!entry.skillFolderHash) {
    return t('noVersionHashAvailable');
  }
  if (!entry.skillPath) {
    return t('noSkillPathRecorded');
  }
  return t('noVersionTracking');
}

function getProgressMessage(
  key: 'checkingSkillUpdatesProgress' | 'updatingSkillsProgress',
  current: number,
  total: number,
): string {
  return t(key, { current, total, skillName: '' });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onSettled?: () => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]!, index);
      onSettled?.();
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => worker(),
    ),
  );
  return results;
}

function sourceDescriptor(entry: ManagedSkillLockEntry): SourceDescriptor {
  if (entry.sourceType === 'local' || isAbsolute(entry.sourceUrl)) {
    return { kind: 'local', localPath: entry.sourceUrl };
  }
  return {
    kind: 'git',
    url: entry.sourceUrl,
    ref: entry.sourceRef,
    githubRepo: getGitHubRepository(entry),
  };
}

function sourceKey(entry: ManagedSkillLockEntry): string {
  const source = sourceDescriptor(entry);
  return source.kind === 'local'
    ? `local\0${source.localPath}`
    : `git\0${source.url}\0${source.ref ?? ''}`;
}

function groupUpdateItems<T extends UpdateItem | NamedReason>(items: T[]) {
  return groupManagedItems(
    items,
    (item) => item.entry,
    (item) => item.directoryName,
  );
}

function printNamedList(title: string, items: NamedReason[]): void {
  if (items.length === 0) {
    return;
  }
  console.log();
  console.log(title);
  for (const group of groupUpdateItems(items)) {
    console.log(`  ${group.label}`);
    for (const item of group.items) {
      console.log(`    - ${item.directoryName}: ${item.reason}`);
    }
  }
}

export async function runUpdate(
  options: {
    isInteractive?: boolean;
    skillNames?: string[];
    createSpinner?: () => ProgressSpinner;
    shouldRenderProgress?: boolean;
    checkConcurrency?: number;
  } = {},
): Promise<void> {
  const requestedNames = options.skillNames?.length
    ? [...new Set(options.skillNames)]
    : [];
  const baseSkills = await listBaseSkills();
  const entries = baseSkills
    .filter(
      (skill): skill is typeof skill & { lockEntry: ManagedSkillLockEntry } =>
        skill.managed && Boolean(skill.lockEntry),
    )
    .map(
      (skill) =>
        [skill.directoryName, skill.lockEntry] as [
          string,
          ManagedSkillLockEntry,
        ],
    );
  const tracked = new Map(entries);

  if (entries.length === 0 && requestedNames.length === 0) {
    console.log(t('noSkillsTrackedInLockFile'));
    return;
  }

  for (const name of requestedNames) {
    if (tracked.has(name)) {
      continue;
    }
    const baseSkill = baseSkills.find((skill) => skill.directoryName === name);
    p.log.error(
      baseSkill
        ? `${name}: ${t('noVersionTracking')}`
        : t('skillNotFound', { skillName: name }),
    );
    process.exit(1);
  }

  const entriesToCheck =
    requestedNames.length > 0
      ? requestedNames.map(
          (name) =>
            [name, tracked.get(name)!] as [string, ManagedSkillLockEntry],
        )
      : entries;
  const shouldRenderProgress =
    options.shouldRenderProgress ?? Boolean(process.stdout.isTTY);
  const createSpinner = options.createSpinner ?? createProgressSpinner;
  const checkSpinner =
    shouldRenderProgress && entriesToCheck.length > 0 ? createSpinner() : null;
  checkSpinner?.start(
    getProgressMessage(
      'checkingSkillUpdatesProgress',
      0,
      entriesToCheck.length,
    ),
  );

  const hashGroups = new Map<
    string,
    {
      repository: string;
      entries: Array<[string, ManagedSkillLockEntry]>;
    }
  >();
  for (const item of entriesToCheck) {
    const [, entry] = item;
    const repository = getGitHubRepository(entry);
    if (!repository || !entry.skillFolderHash || !entry.skillPath) {
      continue;
    }
    const key = `${repository}\0${entry.sourceRef ?? ''}`;
    const group = hashGroups.get(key) ?? { repository, entries: [] };
    group.entries.push(item);
    hashGroups.set(key, group);
  }

  const latestHashes = new Map<string, string>();
  try {
    await mapWithConcurrency(
      [...hashGroups.values()],
      options.checkConcurrency ?? DEFAULT_UPDATE_CHECK_CONCURRENCY,
      async (group) => {
        const entry = group.entries[0]![1];
        const paths = group.entries.map(([, item]) => item.skillPath!);
        const hashes = await fetchSkillFolderHashes(
          group.repository,
          paths,
          getGitHubToken(),
          entry.sourceRef,
        );
        for (const [directoryName, item] of group.entries) {
          const hash = hashes[item.skillPath!];
          if (hash) {
            latestHashes.set(directoryName, hash);
          }
        }
      },
    );
    checkSpinner?.message(
      getProgressMessage(
        'checkingSkillUpdatesProgress',
        entriesToCheck.length,
        entriesToCheck.length,
      ),
    );
  } finally {
    checkSpinner?.stop(
      getProgressMessage(
        'checkingSkillUpdatesProgress',
        entriesToCheck.length,
        entriesToCheck.length,
      ),
    );
  }

  const updates: UpdateItem[] = [];
  const skipped: NamedReason[] = [];
  for (const [directoryName, entry] of entriesToCheck) {
    const latestHash = latestHashes.get(directoryName);
    if (!entry.skillPath) {
      updates.push({
        directoryName,
        entry,
        latestHash: entry.skillFolderHash,
      });
    } else if (requestedNames.length > 0) {
      updates.push({
        directoryName,
        entry,
        latestHash: latestHash ?? entry.skillFolderHash,
      });
    } else if (!entry.skillFolderHash || !entry.skillPath) {
      skipped.push({ directoryName, entry, reason: getSkipReason(entry) });
    } else if (!getGitHubRepository(entry)) {
      skipped.push({ directoryName, entry, reason: getSkipReason(entry) });
    } else if (!latestHash) {
      skipped.push({
        directoryName,
        entry,
        reason: t('couldNotFetchFromGitHub'),
      });
    } else if (latestHash !== entry.skillFolderHash) {
      updates.push({ directoryName, entry, latestHash });
    }
  }

  if (requestedNames.length === 0 && updates.length === 0) {
    console.log(t('allSkillsUpToDate'));
    printNamedList(t('skippedSkills'), skipped);
    return;
  }

  const isInteractive =
    requestedNames.length === 0 &&
    (options.isInteractive ??
      (Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)));
  const updateGroups = groupUpdateItems(updates);
  const orderedUpdates = updateGroups.flatMap((group) => group.items);
  let selectedUpdates = orderedUpdates;
  if (isInteractive) {
    const selection = await multiselectPrompt({
      message: t('selectSkillsToUpdate'),
      options: updateGroups.flatMap((group) =>
        group.items.map((update) => ({
          value: update.directoryName,
          label:
            update.entry.displayName !== update.directoryName
              ? `${update.directoryName} (${update.entry.displayName})`
              : update.directoryName,
          hint: update.entry.source,
          group: group.label,
        })),
      ),
      initialValues: orderedUpdates.map((update) => update.directoryName),
    });
    if (isPromptCancel(selection)) {
      p.cancel(t('updateCancelled'));
      return;
    }
    const selectedNames = new Set(selection);
    selectedUpdates = orderedUpdates.filter((update) =>
      selectedNames.has(update.directoryName),
    );
  }

  if (selectedUpdates.length === 0) {
    p.log.warn(t('noSkillsSelectedForUpdate'));
    printNamedList(t('skippedSkills'), skipped);
    return;
  }

  const updateSpinner = shouldRenderProgress ? createSpinner() : null;
  let completedUpdates = 0;
  updateSpinner?.start(
    getProgressMessage('updatingSkillsProgress', 0, selectedUpdates.length),
  );

  const groups = new Map<string, UpdateItem[]>();
  for (const update of selectedUpdates) {
    const key = sourceKey(update.entry);
    const group = groups.get(key) ?? [];
    group.push(update);
    groups.set(key, group);
  }

  const results: UpdateInstallResult[] = [];
  try {
    for (const group of groups.values()) {
      try {
        await withSource(
          sourceDescriptor(group[0]!.entry),
          async (snapshot) => {
            const matches = new Map<UpdateItem, typeof snapshot.skills>();
            for (const update of group) {
              matches.set(
                update,
                update.entry.skillPath
                  ? snapshot.skills.filter(
                      (skill) => skill.skillPath === update.entry.skillPath,
                    )
                  : snapshot.skills.filter(
                      (skill) =>
                        skill.name.toLowerCase() ===
                        update.entry.displayName.toLowerCase(),
                    ),
              );
            }
            const descriptor = sourceDescriptor(group[0]!.entry);
            const repairPaths = group
              .filter(
                (update) =>
                  !update.entry.skillPath && matches.get(update)?.length === 1,
              )
              .map((update) => matches.get(update)![0]!.skillPath);
            const repairHashes =
              descriptor.kind === 'git' &&
              descriptor.githubRepo &&
              repairPaths.length > 0
                ? await fetchSkillFolderHashes(
                    descriptor.githubRepo,
                    repairPaths,
                    getGitHubToken(),
                    descriptor.ref,
                  )
                : {};
            const groupResults = await mapWithConcurrency(
              group,
              DEFAULT_UPDATE_INSTALL_CONCURRENCY,
              async (update): Promise<UpdateInstallResult> => {
                const matchedSkills = matches.get(update)!;
                if (matchedSkills.length !== 1) {
                  return {
                    directoryName: update.directoryName,
                    outcome: 'failure',
                    reason:
                      matchedSkills.length > 1
                        ? t('ambiguousSkillName', {
                            name: update.entry.displayName,
                            paths: matchedSkills
                              .map((skill) => skill.skillPath)
                              .join(', '),
                          })
                        : t('couldNotLocateSkillInSource'),
                  };
                }
                const matched = matchedSkills[0]!;
                try {
                  await installManagedSkill(
                    matched.path,
                    update.directoryName,
                    {
                      displayName: matched.name,
                      source: update.entry.source,
                      sourceType: update.entry.sourceType,
                      sourceUrl: update.entry.sourceUrl,
                      sourceRef: update.entry.sourceRef,
                      skillPath: matched.skillPath,
                      skillFolderHash: update.entry.skillPath
                        ? update.latestHash
                        : (repairHashes[matched.skillPath] ?? ''),
                    },
                  );
                  return {
                    directoryName: update.directoryName,
                    outcome: 'success',
                  };
                } catch (error) {
                  return {
                    directoryName: update.directoryName,
                    outcome: 'failure',
                    reason:
                      error instanceof Error
                        ? error.message
                        : t('unknownError'),
                  };
                }
              },
              () => {
                completedUpdates += 1;
                updateSpinner?.message(
                  getProgressMessage(
                    'updatingSkillsProgress',
                    completedUpdates,
                    selectedUpdates.length,
                  ),
                );
              },
            );
            results.push(...groupResults);
          },
        );
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : t('unknownError');
        for (const update of group) {
          results.push({
            directoryName: update.directoryName,
            outcome: 'failure',
            reason,
          });
          completedUpdates += 1;
          updateSpinner?.message(
            getProgressMessage(
              'updatingSkillsProgress',
              completedUpdates,
              selectedUpdates.length,
            ),
          );
        }
      }
    }
  } finally {
    updateSpinner?.stop(
      getProgressMessage(
        'updatingSkillsProgress',
        selectedUpdates.length,
        selectedUpdates.length,
      ),
    );
  }

  const successful = results
    .filter((result) => result.outcome === 'success')
    .map((result) => result.directoryName);
  const failed = results
    .filter(
      (result): result is UpdateInstallResult & { reason: string } =>
        result.outcome === 'failure' && Boolean(result.reason),
    )
    .map((result) => ({
      directoryName: result.directoryName,
      entry: tracked.get(result.directoryName)!,
      reason: result.reason,
    }));

  console.log(t('updatedSkills', { count: successful.length }));
  printNamedList(t('failedUpdates'), failed);
  printNamedList(t('skippedSkills'), skipped);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}
