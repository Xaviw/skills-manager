import * as p from '@clack/prompts';
import { mkdir } from 'fs/promises';
import * as readline from 'node:readline';
import { isAbsolute, resolve } from 'path';
import pc from 'picocolors';
import { installBaseSkillToProject, listBaseSkills } from './base-dir.js';
import { t } from './i18n.js';
import {
  isListPromptCancel,
  listPromptCancelSymbol,
  measureDisplayWidth,
  multiselectListPrompt,
  selectListPrompt,
} from './list-prompt.js';
import { showPromptHelp } from './prompt-format.js';

export interface InstallOptions {
  all?: boolean;
  dir?: string;
  link?: boolean;
  copy?: boolean;
}

interface EditableTargetDirectoryOption {
  value: string;
  placeholder?: string;
}

interface PromptForTargetDirDependencies {
  promptTargetDir?: typeof editableTargetDirectoryPrompt;
}

interface RunInstallDependencies {
  promptForTargetDir?: typeof promptForTargetDir;
  promptMultiselect?: typeof multiselectListPrompt;
  promptSelect?: typeof selectListPrompt;
  logPromptHelp?: typeof showPromptHelp;
}

const S_STEP_ACTIVE = pc.green('◆');
const S_STEP_CANCEL = pc.red('■');
const S_STEP_SUBMIT = pc.green('◇');
const S_BAR = pc.dim('│');
const S_FOOT = pc.dim('└');
const S_POINTER = pc.cyan('❯');
const INPUT_CURSOR = pc.inverse(' ');

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

function clearPromptRender(lastRenderHeight: number): void {
  if (lastRenderHeight <= 0) {
    return;
  }

  process.stdout.write(`\x1b[${lastRenderHeight}A`);
  for (let index = 0; index < lastRenderHeight; index += 1) {
    process.stdout.write('\x1b[2K\x1b[1B');
  }
  process.stdout.write(`\x1b[${lastRenderHeight}A`);
}

function truncateFromStart(value: string, maxWidth: number): string {
  if (maxWidth <= 0 || measureDisplayWidth(value) <= maxWidth) {
    return value;
  }

  if (maxWidth <= 3) {
    return '.'.repeat(maxWidth);
  }

  let visible = '';
  for (const char of Array.from(value).reverse()) {
    const next = `${char}${visible}`;
    if (measureDisplayWidth(`...${next}`) > maxWidth) {
      break;
    }
    visible = next;
  }

  return `...${visible}`;
}

function isPrintableInput(str: string, key: readline.Key): boolean {
  return (
    Boolean(str) &&
    !key.ctrl &&
    !key.meta &&
    key.name !== 'return' &&
    key.name !== 'tab'
  );
}

function buildEditableTargetDirectoryOptions(): EditableTargetDirectoryOption[] {
  return [
    { value: INSTALL_TARGET_SHORTCUTS[0].value },
    { value: INSTALL_TARGET_SHORTCUTS[1].value },
    { value: '', placeholder: t('customPathLabel') },
  ];
}

function buildActiveLine(
  prefix: string,
  entry: EditableTargetDirectoryOption,
  maxWidth: number,
): string {
  const availableWidth = Math.max(
    0,
    maxWidth - measureDisplayWidth(prefix) - 1,
  );
  if (entry.value) {
    return `${prefix}${truncateFromStart(entry.value, availableWidth)}${INPUT_CURSOR}`;
  }

  const placeholder = entry.placeholder
    ? truncateFromStart(entry.placeholder, availableWidth)
    : '';
  return `${prefix}${pc.dim(placeholder)}${INPUT_CURSOR}`;
}

export async function editableTargetDirectoryPrompt(options: {
  message: string;
  entries?: EditableTargetDirectoryOption[];
}): Promise<string | symbol> {
  const entries =
    options.entries?.map((entry) => ({ ...entry })) ??
    buildEditableTargetDirectoryOptions();

  return new Promise((_resolve) => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdout.write('\x1b[?25l');

    let cursor = 0;
    let lastRenderHeight = 0;

    const cleanup = (): void => {
      process.stdin.removeListener('keypress', keypressHandler);
      process.stdout.off('resize', resizeHandler);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdout.write('\x1b[?25h');
    };

    const render = (state: 'active' | 'submit' | 'cancel' = 'active'): void => {
      clearPromptRender(lastRenderHeight);

      const width = Math.max((process.stdout.columns ?? 80) - 4, 20);
      const headerPrefix =
        state === 'active'
          ? `${S_STEP_ACTIVE} `
          : state === 'submit'
            ? `${S_STEP_SUBMIT} `
            : `${S_STEP_CANCEL} `;
      const lines = [`${headerPrefix}${pc.bold(options.message)}`, S_BAR];

      entries.forEach((entry, index) => {
        const isActive = state === 'active' && index === cursor;
        const prefix = isActive ? `${S_BAR} ${S_POINTER} ` : `${S_BAR}   `;

        if (isActive) {
          lines.push(buildActiveLine(prefix, entry, width));
          return;
        }

        const availableWidth = Math.max(0, width - measureDisplayWidth(prefix));
        const display = entry.value
          ? truncateFromStart(entry.value, availableWidth)
          : pc.dim(
              entry.placeholder
                ? truncateFromStart(entry.placeholder, availableWidth)
                : '',
            );
        lines.push(`${prefix}${display}`);
      });

      lines.push(S_FOOT);
      process.stdout.write(`${lines.join('\n')}\n`);
      lastRenderHeight = lines.length;
    };

    const submit = (): void => {
      const currentValue = entries[cursor]?.value.trim();
      if (!currentValue) {
        return;
      }

      entries[cursor]!.value = currentValue;
      render('submit');
      cleanup();
      _resolve(currentValue);
    };

    const cancel = (): void => {
      render('cancel');
      cleanup();
      _resolve(listPromptCancelSymbol);
    };

    const resizeHandler = (): void => {
      render();
    };

    const keypressHandler = (str: string, key: readline.Key): void => {
      if (!key) {
        return;
      }

      if (key.name === 'return') {
        submit();
        return;
      }

      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cancel();
        return;
      }

      if (key.name === 'up') {
        cursor = Math.max(0, cursor - 1);
        render();
        return;
      }

      if (key.name === 'down') {
        cursor = Math.min(entries.length - 1, cursor + 1);
        render();
        return;
      }

      if (key.name === 'backspace' || key.name === 'delete') {
        const entry = entries[cursor];
        if (!entry?.value) {
          render();
          return;
        }

        entry.value = entry.value.slice(0, -1);
        render();
        return;
      }

      if (isPrintableInput(str, key)) {
        const entry = entries[cursor];
        if (!entry) {
          return;
        }

        entry.value += str;
        render();
      }
    };

    process.stdout.on('resize', resizeHandler);
    process.stdin.on('keypress', keypressHandler);

    render();
  });
}

export async function promptForTargetDir(
  dependencies: PromptForTargetDirDependencies = {},
): Promise<string | symbol> {
  return (dependencies.promptTargetDir ?? editableTargetDirectoryPrompt)({
    message: t('targetDirectory'),
  });
}

export async function runInstall(
  options: InstallOptions,
  dependencies: RunInstallDependencies = {},
): Promise<void> {
  const skills = await listBaseSkills();
  if (skills.length === 0) {
    p.log.error(t('noSkillsAvailableInBaseDir'));
    process.exit(1);
  }

  const logPromptHelp = dependencies.logPromptHelp ?? showPromptHelp;
  const promptMultiselect =
    dependencies.promptMultiselect ?? multiselectListPrompt;
  const promptSelect = dependencies.promptSelect ?? selectListPrompt;
  const promptTargetDir = dependencies.promptForTargetDir ?? promptForTargetDir;

  let selectedNames = skills.map((skill) => skill.directoryName);
  if (!options.all) {
    logPromptHelp(t('multiselectPromptHelp'));
    const selection = await promptMultiselect({
      message: t('selectSkillsToInstallIntoProject'),
      options: skills.map((skill) => ({
        value: skill.directoryName,
        label: skill.directoryName,
      })),
      initialValues: selectedNames,
      required: true,
    });

    if (isListPromptCancel(selection)) {
      p.cancel(t('installationCancelled'));
      process.exit(0);
    }

    selectedNames = selection as string[];
  }

  let targetDirInput = options.dir;
  if (!targetDirInput) {
    logPromptHelp(t('targetDirectoryPromptHelp'));
    const response = await promptTargetDir();

    if (p.isCancel(response) || isListPromptCancel(response)) {
      p.cancel(t('installationCancelled'));
      process.exit(0);
    }

    targetDirInput = response;
  }

  let mode: 'copy' | 'link' = options.link ? 'link' : 'copy';
  if (!options.link && !options.copy) {
    logPromptHelp(t('selectPromptHelp'));
    const picked = await promptSelect({
      message: t('installationMode'),
      options: [
        { value: 'link', label: t('symlink') },
        { value: 'copy', label: t('copy') },
      ],
    });

    if (isListPromptCancel(picked)) {
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
    }),
  );
}
