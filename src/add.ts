import * as p from '@clack/prompts';
import { relative } from 'path';
import { hasBaseSkillDirectory, installSkillToBaseDir } from './base-dir.js';
import { sanitizeName } from './filesystem.js';
import { cloneRepo, cleanupTempDir } from './git.js';
import { t } from './i18n.js';
import { isListPromptCancel, multiselectListPrompt } from './list-prompt.js';
import { ensureBaseDir, getBaseDir } from './paths.js';
import { formatPromptHint, showPromptHelp } from './prompt-format.js';
import { getOwnerRepo, parseSource } from './source-parser.js';
import { fetchSkillFolderHash, getGitHubToken } from './skill-lock.js';
import { discoverSkills, filterSkills } from './skills.js';
import type { Skill } from './types.js';

export interface AddOptions {
  skill?: string[];
}

interface ResolvedInstall {
  skill: Skill;
  directoryName: string;
}

async function promptForDirectoryName(
  defaultName: string,
): Promise<string | symbol> {
  return p.text({
    message: t('directoryExistsPrompt', { defaultName }),
    defaultValue: `${defaultName}-copy`,
    validate(value) {
      if (!value.trim()) {
        return t('directoryNameRequired');
      }
    },
  });
}

export async function resolveDirectoryName(
  skill: Skill,
  options: AddOptions,
  promptImpl: (
    defaultName: string,
  ) => Promise<string | symbol> = promptForDirectoryName,
  reservedDirectoryNames: Set<string> = new Set(),
): Promise<string> {
  const defaultName = sanitizeName(skill.name);
  const hasConflict = async (directoryName: string): Promise<boolean> => {
    return (
      reservedDirectoryNames.has(directoryName) ||
      (await hasBaseSkillDirectory(directoryName))
    );
  };

  if (!(await hasConflict(defaultName))) {
    reservedDirectoryNames.add(defaultName);
    return defaultName;
  }

  if (options.skill?.length) {
    throw new Error(
      t('skillDirectoryConflict', { directoryName: defaultName }),
    );
  }

  const renamed = await promptImpl(defaultName);
  if (p.isCancel(renamed)) {
    throw new Error(t('installationCancelled'));
  }

  const nextName = sanitizeName(renamed);
  if (await hasConflict(nextName)) {
    throw new Error(t('skillDirectoryConflict', { directoryName: nextName }));
  }

  reservedDirectoryNames.add(nextName);
  return nextName;
}

export function parseAddOptions(args: string[]): {
  source?: string;
  options: AddOptions;
} {
  const options: AddOptions = {};
  let source: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '-s' || arg === '--skill') {
      options.skill = options.skill || [];
      index += 1;
      while (
        index < args.length &&
        args[index] &&
        !args[index]!.startsWith('-')
      ) {
        options.skill.push(args[index]!);
        index += 1;
      }
      index -= 1;
      continue;
    }

    if (!arg?.startsWith('-') && !source) {
      source = arg;
    }
  }

  return { source, options };
}

export async function runAdd(
  sourceInput: string | undefined,
  options: AddOptions = {},
): Promise<void> {
  if (!sourceInput) {
    p.log.error(t('missingSource'));
    process.exit(1);
  }

  await ensureBaseDir();
  const parsed = parseSource(sourceInput);
  let tempDir: string | null = null;

  try {
    const sourceDir =
      parsed.type === 'local'
        ? parsed.localPath!
        : ((tempDir = await cloneRepo(parsed.url, parsed.ref)), tempDir);

    const discoveredSkills = await discoverSkills(sourceDir, parsed.subpath);
    if (discoveredSkills.length === 0) {
      p.log.error(t('noSkillsFoundInSource'));
      process.exit(1);
    }

    let selectedSkills = discoveredSkills;
    if (options.skill?.length) {
      selectedSkills = filterSkills(discoveredSkills, options.skill);
      if (selectedSkills.length === 0) {
        p.log.error(
          t('noMatchingSkillsFound', { names: options.skill.join(', ') }),
        );
        process.exit(1);
      }
    } else {
      showPromptHelp(t('multiselectPromptHelp'));
      const picked = await multiselectListPrompt({
        message: t('selectSkillsToInstall'),
        options: discoveredSkills.map((skill) => ({
          value: skill.name,
          label: skill.name,
          hint: formatPromptHint(skill.description),
        })),
        initialValues: discoveredSkills.map((skill) => skill.name),
        required: true,
      });

      if (isListPromptCancel(picked)) {
        p.cancel(t('installationCancelled'));
        process.exit(0);
      }

      selectedSkills = discoveredSkills.filter((skill) =>
        (picked as string[]).includes(skill.name),
      );
    }

    const reservedDirectoryNames = new Set<string>();
    const resolvedInstalls: ResolvedInstall[] = [];
    for (const skill of selectedSkills) {
      resolvedInstalls.push({
        skill,
        directoryName: await resolveDirectoryName(
          skill,
          options,
          promptForDirectoryName,
          reservedDirectoryNames,
        ),
      });
    }

    const trackableSource = getOwnerRepo(parsed);
    const normalizedSource = trackableSource ?? parsed.url;
    const token = getGitHubToken();

    for (const item of resolvedInstalls) {
      const skillPath = relative(sourceDir, item.skill.path)
        .split('\\')
        .join('/');
      const skillMdRelativePath = skillPath
        ? `${skillPath}/SKILL.md`
        : 'SKILL.md';

      const skillFolderHash = trackableSource
        ? ((await fetchSkillFolderHash(
            trackableSource,
            skillMdRelativePath,
            token,
          )) ?? '')
        : '';

      await installSkillToBaseDir(item.skill.path, item.directoryName, {
        displayName: item.skill.name,
        source: normalizedSource,
        sourceType: parsed.type,
        sourceUrl: parsed.url,
        skillPath: skillMdRelativePath,
        skillFolderHash,
      });
    }

    p.log.success(
      t('installedSkillsIntoBaseDir', {
        count: resolvedInstalls.length,
        baseDir: getBaseDir(),
      }),
    );
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : t('unknownError'));
    process.exit(1);
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir).catch(() => {});
    }
  }
}
