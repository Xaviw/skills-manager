import * as p from '@clack/prompts';
import { mkdir } from 'fs/promises';
import { homedir } from 'os';
import { isAbsolute, resolve } from 'path';
import { listBaseSkills } from './base-dir.js';
import { t } from './i18n.js';
import { installBaseSkillToProject } from './project-install.js';
import { groupBaseSkills } from './skill-groups.js';
import {
  isPromptCancel,
  multiselectPrompt,
  selectPrompt,
  textPrompt,
} from './prompt.js';
import type { PromptCancel } from './prompt.js';
import {
  addSavedTargetDirectory,
  readSavedTargetDirectories,
} from './skill-lock.js';

export interface InstallOptions {
  all?: boolean;
  skill?: string[];
  dir?: string;
  link?: boolean;
  copy?: boolean;
}

interface PromptForTargetDirDependencies {
  readSavedTargetDirectories?: typeof readSavedTargetDirectories;
}

interface RunInstallDependencies {
  saveTargetDirectory?: typeof addSavedTargetDirectory;
}

const customTargetDirectory = { type: 'custom-target-directory' } as const;
const INSTALL_TARGET_SHORTCUT_VALUES = new Set<string>([
  '.agents/skills/',
  '.claude/skills/',
]);

export const INSTALL_TARGET_SHORTCUTS = [
  { value: '.agents/skills/', label: '.agents/skills/' },
  { value: '.claude/skills/', label: '.claude/skills/' },
] as const;

export function parseInstallOptions(args: string[]): InstallOptions {
  const options: InstallOptions = {};

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
    if (arg === '-a' || arg === '--all') {
      options.all = true;
      continue;
    }
    if (arg === '-d' || arg === '--dir') {
      options.dir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '-l' || arg === '--link') {
      options.link = true;
      continue;
    }
    if (arg === '-c' || arg === '--copy') {
      options.copy = true;
    }
  }

  return options;
}

function resolveTargetDir(inputDir: string): string {
  const expandedInputDir = expandHomeDirectory(inputDir);
  return isAbsolute(expandedInputDir)
    ? expandedInputDir
    : resolve(process.cwd(), expandedInputDir);
}

function expandHomeDirectory(inputDir: string): string {
  if (inputDir === '~') {
    return homedir();
  }

  if (inputDir.startsWith('~/') || inputDir.startsWith('~\\')) {
    return resolve(homedir(), inputDir.slice(2));
  }

  return inputDir;
}

function shouldSaveTargetDirectory(targetDir: string): boolean {
  return !INSTALL_TARGET_SHORTCUT_VALUES.has(targetDir.trim());
}

export async function promptForTargetDir(
  dependencies: PromptForTargetDirDependencies = {},
): Promise<string | PromptCancel> {
  const savedTargetDirectories = await (
    dependencies.readSavedTargetDirectories ?? readSavedTargetDirectories
  )();
  const customDirectories = savedTargetDirectories.filter(
    (entry) => !INSTALL_TARGET_SHORTCUT_VALUES.has(entry),
  );
  const selected = await selectPrompt<string | typeof customTargetDirectory>({
    message: t('targetDirectory'),
    options: [
      ...INSTALL_TARGET_SHORTCUTS,
      ...customDirectories.map((value) => ({ value, label: value })),
      { value: customTargetDirectory, label: t('customPathLabel') },
    ],
  });

  if (isPromptCancel(selected)) {
    return selected;
  }
  if (typeof selected === 'string') {
    return selected;
  }

  return textPrompt({
    message: t('targetDirectory'),
    placeholder: './custom/skills',
    validate(value) {
      if (!value.trim()) {
        return t('targetDirectoryRequired');
      }
    },
  });
}

export async function runInstall(
  options: InstallOptions,
  dependencies: RunInstallDependencies = {},
): Promise<void> {
  if (
    (!process.stdin.isTTY || !process.stdout.isTTY) &&
    ((!options.skill?.length && !options.all) ||
      !options.dir ||
      (!options.link && !options.copy))
  ) {
    p.log.error(t('nonInteractiveInstallRequiresOptions'));
    process.exit(1);
  }

  const skills = await listBaseSkills();
  if (skills.length === 0) {
    p.log.error(t('noSkillsAvailableInBaseDir'));
    process.exit(1);
  }

  const saveTargetDirectory =
    dependencies.saveTargetDirectory ?? addSavedTargetDirectory;
  const groups = groupBaseSkills(skills);
  const orderedSkills = groups.flatMap((group) => group.skills);

  let selectedNames = orderedSkills.map((skill) => skill.directoryName);
  if (options.skill?.length) {
    const uniqueSkillNames = [...new Set(options.skill)];
    const availableSkills = new Set(selectedNames);

    for (const skillName of uniqueSkillNames) {
      if (!availableSkills.has(skillName)) {
        p.log.error(t('skillNotFound', { skillName }));
        process.exit(1);
      }
    }

    selectedNames = uniqueSkillNames;
  } else if (!options.all) {
    const selection = await multiselectPrompt({
      message: t('selectSkillsToInstallIntoProject'),
      options: groups.flatMap((group) =>
        group.skills.map((skill) => ({
          value: skill.directoryName,
          label: skill.directoryName,
          group: group.label,
        })),
      ),
      initialValues: selectedNames,
    });

    if (isPromptCancel(selection)) {
      p.cancel(t('installationCancelled'));
      return;
    }

    selectedNames = selection;
  }

  let targetDirInput = options.dir;
  let shouldPersistTargetDirectory = false;
  if (!targetDirInput) {
    const response = await promptForTargetDir();

    if (isPromptCancel(response)) {
      p.cancel(t('installationCancelled'));
      return;
    }

    targetDirInput = response;
    shouldPersistTargetDirectory = true;
  }

  let mode: 'copy' | 'link' = options.link ? 'link' : 'copy';
  if (!options.link && !options.copy) {
    const picked = await selectPrompt<'link' | 'copy'>({
      message: t('installationMode'),
      options: [
        { value: 'link', label: t('symlink') },
        { value: 'copy', label: t('copy') },
      ],
    });

    if (isPromptCancel(picked)) {
      p.cancel(t('installationCancelled'));
      return;
    }

    mode = picked;
  }

  const targetDir = resolveTargetDir(targetDirInput);
  await mkdir(targetDir, { recursive: true });

  const results = [];
  for (const skillName of selectedNames) {
    results.push(await installBaseSkillToProject(skillName, targetDir, mode));
  }

  if (
    shouldPersistTargetDirectory &&
    shouldSaveTargetDirectory(targetDirInput)
  ) {
    await saveTargetDirectory(targetDirInput.trim()).catch(() => {});
  }

  p.log.success(
    t('installedSkillsIntoTargetDir', {
      count: results.length,
      targetDir,
      linkSuffix: mode === 'link' ? t('usingLinksWherePossible') : '',
    }),
  );
}
