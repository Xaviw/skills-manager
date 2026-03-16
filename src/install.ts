import * as p from '@clack/prompts';
import { mkdir } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import pc from 'picocolors';
import { t } from './i18n.js';
import { installBaseSkillToProject, listBaseSkills } from './base-dir.js';

export interface InstallOptions {
  all?: boolean;
  dir?: string;
  link?: boolean;
  copy?: boolean;
}

export const INSTALL_TARGET_SHORTCUTS = [
  { value: '.agents/skills/', label: '.agents/skills/' },
  { value: '.claude/skills/', label: '.claude/skills/' },
  { value: '__custom__', label: t('customPathLabel') },
] as const;

export function parseInstallOptions(args: string[]): InstallOptions {
  const options: InstallOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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
  return isAbsolute(inputDir) ? inputDir : resolve(process.cwd(), inputDir);
}

export async function promptForTargetDir(
  promptSelect: typeof p.select = p.select,
  promptText: typeof p.text = p.text
): Promise<string | symbol> {
  const picked = await promptSelect({
    message: `${t('targetDirectory')} ${pc.dim(t('selectPromptHelp'))}`,
    options: [...INSTALL_TARGET_SHORTCUTS],
  });

  if (p.isCancel(picked)) {
    return picked;
  }

  if (picked !== '__custom__') {
    return picked as string;
  }

  return promptText({
    message: t('customTargetDirectory'),
    placeholder: './src/agents',
    validate(value) {
      if (!value.trim()) {
        return t('targetDirectoryRequired');
      }
    },
  });
}

export async function runInstall(options: InstallOptions): Promise<void> {
  const skills = await listBaseSkills();
  if (skills.length === 0) {
    p.log.error(t('noSkillsAvailableInBaseDir'));
    process.exit(1);
  }

  let selectedNames = skills.map((skill) => skill.directoryName);
  if (!options.all) {
    const selection = await p.multiselect({
      message: `${t('selectSkillsToInstallIntoProject')} ${pc.dim(t('multiselectPromptHelp'))}`,
      options: skills.map((skill) => ({
        value: skill.directoryName,
        label: skill.directoryName,
      })),
      initialValues: selectedNames,
      required: true,
    });

    if (p.isCancel(selection)) {
      p.cancel(t('installationCancelled'));
      process.exit(0);
    }

    selectedNames = selection as string[];
  }

  let targetDirInput = options.dir;
  if (!targetDirInput) {
    const response = await promptForTargetDir();

    if (p.isCancel(response)) {
      p.cancel(t('installationCancelled'));
      process.exit(0);
    }

    targetDirInput = response;
  }

  let mode: 'copy' | 'link' = options.link ? 'link' : 'copy';
  if (!options.link && !options.copy) {
    const picked = await p.select({
      message: `${t('installationMode')} ${pc.dim(t('selectPromptHelp'))}`,
      options: [
        { value: 'link', label: t('symlink') },
        { value: 'copy', label: t('copy') },
      ],
    });

    if (p.isCancel(picked)) {
      p.cancel(t('installationCancelled'));
      process.exit(0);
    }

    mode = picked as 'copy' | 'link';
  }

  const targetDir = resolveTargetDir(targetDirInput);
  await mkdir(targetDir, { recursive: true });

  const results = [];
  for (const skillName of selectedNames) {
    results.push(await installBaseSkillToProject(skillName, targetDir, mode));
  }

  p.log.success(
    t('installedSkillsIntoTargetDir', {
      count: results.length,
      targetDir,
      linkSuffix: mode === 'link' ? t('usingLinksWherePossible') : '',
    })
  );
}

