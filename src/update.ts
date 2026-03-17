import * as p from '@clack/prompts';
import { relative } from 'path';
import { installSkillToBaseDir } from './base-dir.js';
import { cloneRepo, cleanupTempDir } from './git.js';
import { t } from './i18n.js';
import { isListPromptCancel, multiselectListPrompt } from './list-prompt.js';
import { formatPromptHint, showPromptHelp } from './prompt-format.js';
import { discoverSkills } from './skills.js';
import {
  fetchSkillFolderHash,
  getGitHubToken,
  readSkillLock,
} from './skill-lock.js';
import { parseSource } from './source-parser.js';

const DEFAULT_UPDATE_CHECK_CONCURRENCY = 4;

type UpdateSpinner = ReturnType<typeof p.spinner>;
type UpdateEntry = Awaited<ReturnType<typeof readSkillLock>>['skills'][string];

interface UpdateCheckResult {
  directoryName: string;
  outcome: 'update' | 'skip' | 'noop';
  reason?: string;
  latestHash?: string;
  entry: UpdateEntry;
}

function getSkipReason(entry: {
  sourceType: string;
  skillFolderHash?: string;
  skillPath?: string;
}): string {
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
  directoryName?: string,
): string {
  return t(key, {
    current,
    total,
    skillName: directoryName ?? '',
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onSettled?: (item: T, index: number, completedCount: number) => void,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;
  let completedCount = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex;
      if (currentIndex >= items.length) {
        return;
      }

      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
      completedCount += 1;
      onSettled?.(items[currentIndex]!, currentIndex, completedCount);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

export async function runUpdate(
  options: {
    isInteractive?: boolean;
    promptMultiselect?: typeof multiselectListPrompt;
    logPromptHelp?: (helpText: string) => void;
    skillNames?: string[];
    createSpinner?: () => UpdateSpinner;
    shouldRenderProgress?: boolean;
    checkConcurrency?: number;
  } = {},
): Promise<void> {
  const requestedSkillNames = options.skillNames?.length
    ? [...new Set(options.skillNames)]
    : [];
  const lock = await readSkillLock();
  const skillEntries = Object.entries(lock.skills);

  const printNamedList = (
    title: string,
    items: Array<{ directoryName: string; reason: string }>,
  ): void => {
    if (items.length === 0) {
      return;
    }

    console.log();
    console.log(title);
    for (const item of items) {
      console.log(`  - ${item.directoryName}: ${item.reason}`);
    }
  };

  const exitForRequestedSkill = (
    directoryName: string,
    reason: string,
  ): never => {
    p.log.error(`${directoryName}: ${reason}`);
    process.exit(1);
  };

  if (skillEntries.length === 0 && requestedSkillNames.length === 0) {
    console.log(t('noSkillsTrackedInLockFile'));
    return;
  }

  const trackedSkills = new Map(skillEntries);
  if (requestedSkillNames.length > 0) {
    const { listBaseSkills } = await import('./base-dir.js');
    const baseSkills = await listBaseSkills();

    for (const skillName of requestedSkillNames) {
      if (trackedSkills.has(skillName)) {
        continue;
      }

      const baseSkill = baseSkills.find(
        (skill) => skill.directoryName === skillName,
      );
      if (baseSkill) {
        exitForRequestedSkill(skillName, t('noVersionTracking'));
      }

      p.log.error(t('skillNotFound', { skillName }));
      process.exit(1);
    }
  }

  const entriesToCheck =
    requestedSkillNames.length > 0
      ? requestedSkillNames.map(
          (skillName) => [skillName, trackedSkills.get(skillName)!] as const,
        )
      : skillEntries;

  const token = getGitHubToken();
  const updates: Array<{
    directoryName: string;
    latestHash: string;
    entry: UpdateEntry;
  }> = [];
  const skipped: Array<{ directoryName: string; reason: string }> = [];
  const shouldRenderProgress =
    options.shouldRenderProgress ?? Boolean(process.stdout.isTTY);
  const createSpinner = options.createSpinner ?? (() => p.spinner());
  const checkSpinner =
    shouldRenderProgress && entriesToCheck.length > 0 ? createSpinner() : null;

  checkSpinner?.start(
    getProgressMessage(
      'checkingSkillUpdatesProgress',
      0,
      entriesToCheck.length,
    ),
  );

  const updateCheckResults = await mapWithConcurrency(
    entriesToCheck,
    options.checkConcurrency ?? DEFAULT_UPDATE_CHECK_CONCURRENCY,
    async ([directoryName, entry]): Promise<UpdateCheckResult> => {
      if (!entry.skillFolderHash || !entry.skillPath) {
        return {
          directoryName,
          outcome: 'skip',
          reason: getSkipReason(entry),
          entry,
        };
      }

      try {
        const latestHash = await fetchSkillFolderHash(
          entry.source,
          entry.skillPath,
          token,
        );
        if (!latestHash) {
          return {
            directoryName,
            outcome: 'skip',
            reason: t('couldNotFetchFromGitHub'),
            entry,
          };
        }

        if (
          requestedSkillNames.length > 0 ||
          latestHash !== entry.skillFolderHash
        ) {
          return {
            directoryName,
            outcome: 'update',
            latestHash,
            entry,
          };
        }

        return {
          directoryName,
          outcome: 'noop',
          entry,
        };
      } catch {
        return {
          directoryName,
          outcome: 'skip',
          reason: t('failedToCheckUpdate'),
          entry,
        };
      }
    },
    ([directoryName], _index, completedCount) => {
      checkSpinner?.message(
        getProgressMessage(
          'checkingSkillUpdatesProgress',
          completedCount,
          entriesToCheck.length,
          directoryName,
        ),
      );
    },
  );

  checkSpinner?.stop(
    getProgressMessage(
      'checkingSkillUpdatesProgress',
      entriesToCheck.length,
      entriesToCheck.length,
    ),
  );

  for (const result of updateCheckResults) {
    if (result.outcome === 'skip') {
      if (requestedSkillNames.length > 0) {
        exitForRequestedSkill(result.directoryName, result.reason!);
      }

      skipped.push({
        directoryName: result.directoryName,
        reason: result.reason!,
      });
      continue;
    }

    if (result.outcome === 'update') {
      updates.push({
        directoryName: result.directoryName,
        latestHash: result.latestHash!,
        entry: result.entry,
      });
    }
  }

  if (requestedSkillNames.length === 0 && updates.length === 0) {
    console.log(t('allSkillsUpToDate'));
    printNamedList(t('skippedSkills'), skipped);
    return;
  }

  const isInteractive =
    requestedSkillNames.length === 0 &&
    (options.isInteractive ??
      (Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)));
  let selectedUpdates = updates;

  if (isInteractive) {
    (options.logPromptHelp ?? showPromptHelp)(t('multiselectPromptHelp'));
    const selection = await (
      options.promptMultiselect ?? multiselectListPrompt
    )({
      message: t('selectSkillsToUpdate'),
      options: updates.map((update) => ({
        value: update.directoryName,
        label:
          update.entry.displayName &&
          update.entry.displayName !== update.directoryName
            ? `${update.directoryName} (${update.entry.displayName})`
            : update.directoryName,
        hint: formatPromptHint(update.entry.source),
      })),
      initialValues: updates.map((update) => update.directoryName),
      required: true,
    });

    if (isListPromptCancel(selection)) {
      p.cancel(t('updateCancelled'));
      return;
    }

    const selectedNames = new Set(selection as string[]);
    selectedUpdates = updates.filter((update) =>
      selectedNames.has(update.directoryName),
    );
  }

  if (selectedUpdates.length === 0) {
    p.log.warn(t('noSkillsSelectedForUpdate'));
    printNamedList(t('skippedSkills'), skipped);
    return;
  }

  const successfulUpdates: string[] = [];
  const failedUpdates: Array<{ directoryName: string; reason: string }> = [];
  const updateSpinner =
    shouldRenderProgress && selectedUpdates.length > 0 ? createSpinner() : null;

  updateSpinner?.start(
    getProgressMessage('updatingSkillsProgress', 0, selectedUpdates.length),
  );

  for (const [index, update] of selectedUpdates.entries()) {
    let tempDir: string | null = null;

    try {
      updateSpinner?.message(
        getProgressMessage(
          'updatingSkillsProgress',
          index + 1,
          selectedUpdates.length,
          update.directoryName,
        ),
      );

      const parsed = parseSource(update.entry.sourceUrl);
      const sourceDir =
        parsed.type === 'local'
          ? parsed.localPath!
          : ((tempDir = await cloneRepo(parsed.url, parsed.ref)), tempDir);

      const allSkills = await discoverSkills(sourceDir, parsed.subpath);
      const matchedSkill = allSkills.find((skill) => {
        const skillPath = relative(sourceDir, skill.path).split('\\').join('/');
        const skillMdRelativePath = skillPath
          ? `${skillPath}/SKILL.md`
          : 'SKILL.md';
        return skillMdRelativePath === update.entry.skillPath;
      });

      if (!matchedSkill) {
        failedUpdates.push({
          directoryName: update.directoryName,
          reason: t('couldNotLocateSkillInSource'),
        });
        continue;
      }

      await installSkillToBaseDir(matchedSkill.path, update.directoryName, {
        displayName: matchedSkill.name,
        source: update.entry.source,
        sourceType: update.entry.sourceType,
        sourceUrl: update.entry.sourceUrl,
        skillPath: update.entry.skillPath,
        skillFolderHash: update.latestHash,
      });

      successfulUpdates.push(update.directoryName);
    } catch (error) {
      failedUpdates.push({
        directoryName: update.directoryName,
        reason: error instanceof Error ? error.message : t('unknownError'),
      });
    } finally {
      if (tempDir) {
        await cleanupTempDir(tempDir).catch(() => {});
      }
    }
  }

  updateSpinner?.stop(
    getProgressMessage(
      'updatingSkillsProgress',
      selectedUpdates.length,
      selectedUpdates.length,
    ),
  );

  console.log(t('updatedSkills', { count: successfulUpdates.length }));
  printNamedList(t('failedUpdates'), failedUpdates);
  printNamedList(t('skippedSkills'), skipped);

  if (failedUpdates.length > 0) {
    process.exitCode = 1;
  }
}
