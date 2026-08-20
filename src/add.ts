import * as p from '@clack/prompts';
import { installManagedSkill, listBaseSkills } from './base-dir.js';
import { sanitizeName } from './filesystem.js';
import { fetchSkillFolderHashes, getGitHubToken } from './github.js';
import { t } from './i18n.js';
import { ensureBaseDir, getBaseDir } from './paths.js';
import { createProgressSpinner } from './progress-spinner.js';
import { isPromptCancel, multiselectPrompt, textPrompt } from './prompt.js';
import type { PromptCancel } from './prompt.js';
import {
  compareNames,
  getRepositoryIdentity,
  getSourceRepositoryIdentity,
} from './skill-groups.js';
import { withSource } from './source-intake.js';
import type { Skill, SourceIssue, SourceSkill } from './types.js';
import type { ProgressSpinner } from './progress-spinner.js';

export interface AddOptions {
  skill?: string[];
}

interface ResolvedInstall {
  skill: SourceSkill;
  directoryName: string;
}

function getSourceIssueMessage(issue: SourceIssue): string {
  const keys = {
    'unreadable-skill': 'unreadableSkillManifest',
    'invalid-skill': 'invalidSkillManifest',
    'outside-source': 'skillOutsideSource',
  } as const;
  return `${issue.skillPath}: ${t(keys[issue.code])}`;
}

function selectNamedSkills(
  skills: SourceSkill[],
  names: string[],
): SourceSkill[] {
  const selected = new Map<string, SourceSkill>();
  for (const name of names) {
    const matches = skills.filter(
      (skill) => skill.name.toLowerCase() === name.toLowerCase(),
    );
    if (matches.length > 1) {
      throw new Error(
        t('ambiguousSkillName', {
          name,
          paths: matches.map((skill) => skill.skillPath).join(', '),
        }),
      );
    }
    if (matches[0]) {
      selected.set(matches[0].skillPath, matches[0]);
    }
  }
  return [...selected.values()];
}

function getMetadataProgressMessage(
  current: number,
  total: number,
  skillName?: string,
): string {
  return t('fetchingSkillMetadataProgress', {
    current,
    total,
    skillName: skillName ?? '',
  });
}

async function promptForDirectoryName(
  defaultName: string,
): Promise<string | PromptCancel> {
  return textPrompt({
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
  ) => Promise<string | PromptCancel> = promptForDirectoryName,
  reservedDirectoryNames: Set<string> = new Set(),
): Promise<string | PromptCancel> {
  const defaultName = sanitizeName(skill.name);
  if (!reservedDirectoryNames.has(defaultName)) {
    reservedDirectoryNames.add(defaultName);
    return defaultName;
  }

  if (options.skill?.length) {
    throw new Error(
      t('skillDirectoryConflict', { directoryName: defaultName }),
    );
  }

  const renamed = await promptImpl(defaultName);
  if (isPromptCancel(renamed)) {
    return renamed;
  }

  const nextName = sanitizeName(renamed);
  if (reservedDirectoryNames.has(nextName)) {
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
  if (
    !options.skill?.length &&
    (!process.stdin.isTTY || !process.stdout.isTTY)
  ) {
    p.log.error(t('nonInteractiveAddRequiresSkill'));
    process.exit(1);
  }

  await ensureBaseDir();
  const shouldRenderProgress = Boolean(process.stdout.isTTY);
  let cancelled = false;
  let installedCount = 0;

  try {
    await withSource(sourceInput, async ({ source, skills, issues }) => {
      for (const issue of issues) {
        p.log.warn(getSourceIssueMessage(issue));
      }

      if (skills.length === 0) {
        throw new Error(t('noSkillsFoundInSource'));
      }

      const orderedSkills = [...skills].sort(
        (left, right) =>
          compareNames(left.name, right.name) ||
          compareNames(left.skillPath, right.skillPath),
      );
      let selectedSkills = orderedSkills;
      if (options.skill?.length) {
        selectedSkills = selectNamedSkills(orderedSkills, options.skill);
        if (selectedSkills.length === 0) {
          throw new Error(
            t('noMatchingSkillsFound', { names: options.skill.join(', ') }),
          );
        }
      } else {
        const picked = await multiselectPrompt({
          message: t('selectSkillsToInstall'),
          options: orderedSkills.map((skill) => ({
            value: skill.skillPath,
            label: skill.name,
            hint: `${skill.description} - ${skill.skillPath}`,
          })),
          initialValues: orderedSkills.map((skill) => skill.skillPath),
        });

        if (isPromptCancel(picked)) {
          p.cancel(t('installationCancelled'));
          cancelled = true;
          return;
        }

        selectedSkills = orderedSkills.filter((skill) =>
          picked.includes(skill.skillPath),
        );
      }

      const baseSkills = await listBaseSkills();
      const reservedDirectoryNames = new Set(
        baseSkills.map((skill) => skill.directoryName),
      );
      const repositoryIdentity = getSourceRepositoryIdentity(source);
      const resolvedInstalls: ResolvedInstall[] = [];
      for (const skill of selectedSkills) {
        const matches = baseSkills.filter(
          (baseSkill) =>
            baseSkill.lockEntry?.skillPath === skill.skillPath &&
            getRepositoryIdentity(baseSkill.lockEntry) === repositoryIdentity,
        );
        if (matches.length > 1) {
          throw new Error(
            t('managedSkillIdentityConflict', { skillPath: skill.skillPath }),
          );
        }
        const directoryName =
          matches[0]?.directoryName ??
          (await resolveDirectoryName(
            skill,
            options,
            promptForDirectoryName,
            reservedDirectoryNames,
          ));
        if (isPromptCancel(directoryName)) {
          p.cancel(t('installationCancelled'));
          cancelled = true;
          return;
        }
        resolvedInstalls.push({
          skill,
          directoryName,
        });
      }

      const sourceUrl = source.kind === 'local' ? source.localPath : source.url;
      const normalizedSource =
        source.kind === 'git' && source.githubRepo
          ? source.githubRepo
          : sourceUrl;
      const sourceType =
        source.kind === 'local'
          ? 'local'
          : source.kind === 'remote'
            ? source.wellKnown
              ? 'well-known'
              : 'download'
            : source.githubRepo
              ? 'github'
              : 'git';
      const token = getGitHubToken();
      const metadataSpinner: ProgressSpinner | null =
        shouldRenderProgress &&
        source.kind === 'git' &&
        source.githubRepo &&
        resolvedInstalls.length > 0
          ? createProgressSpinner()
          : null;
      let completedMetadataCount = 0;

      metadataSpinner?.start(
        getMetadataProgressMessage(0, resolvedInstalls.length),
      );

      try {
        const hashes =
          source.kind === 'git' && source.githubRepo
            ? await fetchSkillFolderHashes(
                source.githubRepo,
                resolvedInstalls.map((item) => item.skill.skillPath),
                token,
                source.ref,
              )
            : {};
        for (const item of resolvedInstalls) {
          metadataSpinner?.message(
            getMetadataProgressMessage(
              completedMetadataCount + 1,
              resolvedInstalls.length,
              item.skill.name,
            ),
          );

          completedMetadataCount += 1;

          await installManagedSkill(item.skill.path, item.directoryName, {
            displayName: item.skill.name,
            source: normalizedSource,
            sourceType,
            sourceUrl,
            sourceRef: source.kind === 'git' ? source.ref : undefined,
            skillPath: item.skill.skillPath,
            skillFolderHash: hashes[item.skill.skillPath] ?? '',
          });
        }
      } finally {
        metadataSpinner?.stop(
          getMetadataProgressMessage(
            completedMetadataCount,
            resolvedInstalls.length,
          ),
        );
      }

      installedCount = resolvedInstalls.length;
    });
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : t('unknownError'));
    process.exit(1);
  }

  if (!cancelled) {
    p.log.success(
      t('installedSkillsIntoBaseDir', {
        count: installedCount,
        baseDir: getBaseDir(),
      }),
    );
  }
}
