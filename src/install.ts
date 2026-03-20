import * as p from '@clack/prompts';
import { mkdir } from 'fs/promises';
import * as readline from 'node:readline';
import { homedir } from 'os';
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

interface EditableTargetDirectoryOption {
  value: string;
  placeholder?: string;
}

interface EditableTargetDirectoryInputState {
  value: string;
  cursorOffset: number;
}

interface EditableTargetDirectoryActiveLine {
  line: string;
  cursorColumn: number;
}

interface PromptForTargetDirDependencies {
  promptTargetDir?: typeof editableTargetDirectoryPrompt;
  readSavedTargetDirectories?: typeof readSavedTargetDirectories;
}

interface RunInstallDependencies {
  promptForTargetDir?: typeof promptForTargetDir;
  promptMultiselect?: typeof multiselectListPrompt;
  promptSelect?: typeof selectListPrompt;
  logPromptHelp?: typeof showPromptHelp;
  saveTargetDirectory?: typeof addSavedTargetDirectory;
}

const S_STEP_ACTIVE = pc.green('◆');
const S_STEP_CANCEL = pc.red('■');
const S_STEP_SUBMIT = pc.green('◇');
const S_BAR = pc.dim('│');
const S_FOOT = pc.dim('└');
const S_POINTER = pc.cyan('❯');
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

function buildEditableTargetDirectoryOptions(
  savedTargetDirectories: string[] = [],
): EditableTargetDirectoryOption[] {
  const customDirectoryOptions = savedTargetDirectories
    .filter((entry) => !INSTALL_TARGET_SHORTCUT_VALUES.has(entry))
    .map((entry) => ({ value: entry }));

  return [
    { value: INSTALL_TARGET_SHORTCUTS[0].value },
    { value: INSTALL_TARGET_SHORTCUTS[1].value },
    ...customDirectoryOptions,
    { value: '', placeholder: t('customPathLabel') },
  ];
}

function shouldSaveTargetDirectory(targetDir: string): boolean {
  return !INSTALL_TARGET_SHORTCUT_VALUES.has(targetDir.trim());
}

function clampEditableCursorOffset(
  value: string,
  cursorOffset: number,
): number {
  return Math.max(0, Math.min(Array.from(value).length, cursorOffset));
}

function getVisibleEditableText(
  value: string,
  cursorOffset: number,
  maxWidth: number,
): { before: string; after: string } {
  const characters = Array.from(value);
  const safeCursorOffset = clampEditableCursorOffset(value, cursorOffset);

  if (maxWidth <= 0) {
    return { before: '', after: '' };
  }

  let bestWindow = {
    start: safeCursorOffset,
    end: safeCursorOffset,
    visibleChars: 0,
    width: 0,
    hiddenChars: characters.length,
    balance: 0,
  };

  for (let start = 0; start <= safeCursorOffset; start += 1) {
    for (let end = safeCursorOffset; end <= characters.length; end += 1) {
      const before = characters.slice(start, safeCursorOffset).join('');
      const after = characters.slice(safeCursorOffset, end).join('');
      const leftEllipsis = start > 0 ? '...' : '';
      const rightEllipsis = end < characters.length ? '...' : '';
      const displayWidth = measureDisplayWidth(
        `${leftEllipsis}${before}${after}${rightEllipsis}`,
      );

      if (displayWidth > maxWidth) {
        continue;
      }

      const visibleChars = end - start;
      const hiddenChars = start + (characters.length - end);
      const balance = Math.abs(
        safeCursorOffset - start - (end - safeCursorOffset),
      );
      const shouldReplace =
        visibleChars > bestWindow.visibleChars ||
        (visibleChars === bestWindow.visibleChars &&
          displayWidth > bestWindow.width) ||
        (visibleChars === bestWindow.visibleChars &&
          displayWidth === bestWindow.width &&
          hiddenChars < bestWindow.hiddenChars) ||
        (visibleChars === bestWindow.visibleChars &&
          displayWidth === bestWindow.width &&
          hiddenChars === bestWindow.hiddenChars &&
          balance < bestWindow.balance);

      if (shouldReplace) {
        bestWindow = {
          start,
          end,
          visibleChars,
          width: displayWidth,
          hiddenChars,
          balance,
        };
      }
    }
  }

  return {
    before: `${bestWindow.start > 0 ? '...' : ''}${characters
      .slice(bestWindow.start, safeCursorOffset)
      .join('')}`,
    after: `${characters.slice(safeCursorOffset, bestWindow.end).join('')}${
      bestWindow.end < characters.length ? '...' : ''
    }`,
  };
}

export function applyEditableTargetDirectoryInput(
  state: EditableTargetDirectoryInputState,
  str: string,
  key: readline.Key,
): EditableTargetDirectoryInputState {
  const characters = Array.from(state.value);
  const cursorOffset = clampEditableCursorOffset(
    state.value,
    state.cursorOffset,
  );

  if (key.name === 'left') {
    return {
      value: state.value,
      cursorOffset: Math.max(0, cursorOffset - 1),
    };
  }

  if (key.name === 'right') {
    return {
      value: state.value,
      cursorOffset: Math.min(characters.length, cursorOffset + 1),
    };
  }

  if (key.name === 'backspace') {
    if (cursorOffset === 0) {
      return { value: state.value, cursorOffset };
    }

    characters.splice(cursorOffset - 1, 1);
    return {
      value: characters.join(''),
      cursorOffset: cursorOffset - 1,
    };
  }

  if (key.name === 'delete') {
    if (cursorOffset >= characters.length) {
      return { value: state.value, cursorOffset };
    }

    characters.splice(cursorOffset, 1);
    return {
      value: characters.join(''),
      cursorOffset,
    };
  }

  if (!isPrintableInput(str, key)) {
    return { value: state.value, cursorOffset };
  }

  characters.splice(cursorOffset, 0, ...Array.from(str));
  return {
    value: characters.join(''),
    cursorOffset: cursorOffset + Array.from(str).length,
  };
}

export function buildActiveLine(
  prefix: string,
  entry: EditableTargetDirectoryOption,
  maxWidth: number,
  cursorOffset: number,
): EditableTargetDirectoryActiveLine {
  const availableWidth = Math.max(0, maxWidth - measureDisplayWidth(prefix));
  if (entry.value) {
    const visibleText = getVisibleEditableText(
      entry.value,
      cursorOffset,
      availableWidth,
    );
    return {
      line: `${prefix}${visibleText.before}${visibleText.after}`,
      cursorColumn: measureDisplayWidth(`${prefix}${visibleText.before}`) + 1,
    };
  }

  const placeholder = entry.placeholder
    ? truncateFromStart(entry.placeholder, availableWidth)
    : '';
  return {
    line: `${prefix}${pc.dim(placeholder)}`,
    cursorColumn: measureDisplayWidth(prefix) + 1,
  };
}

function moveEditablePromptCursorToRenderEnd(
  renderHeight: number,
  activeLineIndex: number | null,
): void {
  if (renderHeight <= 0 || activeLineIndex === null) {
    return;
  }

  const downLines = renderHeight - activeLineIndex;
  if (downLines > 0) {
    process.stdout.write(`\x1b[${downLines}B`);
  }
  process.stdout.write('\r');
}

function positionEditablePromptCursor(
  renderHeight: number,
  activeLineIndex: number,
  cursorColumn: number,
): void {
  const upLines = renderHeight - activeLineIndex;
  process.stdout.write('\x1b[?25h');
  if (upLines > 0) {
    process.stdout.write(`\x1b[${upLines}A`);
  }
  process.stdout.write(`\x1b[${cursorColumn}G`);
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
    let lastActiveLineIndex: number | null = null;
    const entryCursorOffsets = entries.map(
      (entry) => Array.from(entry.value).length,
    );

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
      process.stdout.write('\x1b[?25l');
      moveEditablePromptCursorToRenderEnd(
        lastRenderHeight,
        lastActiveLineIndex,
      );
      clearPromptRender(lastRenderHeight);
      lastActiveLineIndex = null;

      const width = Math.max((process.stdout.columns ?? 80) - 4, 20);
      const headerPrefix =
        state === 'active'
          ? `${S_STEP_ACTIVE} `
          : state === 'submit'
            ? `${S_STEP_SUBMIT} `
            : `${S_STEP_CANCEL} `;
      const lines = [`${headerPrefix}${pc.bold(options.message)}`, S_BAR];
      let activeLine: EditableTargetDirectoryActiveLine | null = null;
      let activeLineIndex: number | null = null;

      for (const [index, entry] of entries.entries()) {
        const isActive = state === 'active' && index === cursor;
        const prefix = isActive ? `${S_BAR} ${S_POINTER} ` : `${S_BAR}   `;

        if (isActive) {
          activeLine = buildActiveLine(
            prefix,
            entry,
            width,
            entryCursorOffsets[index] ?? 0,
          );
          activeLineIndex = lines.length;
          lines.push(activeLine.line);
          continue;
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
      }

      lines.push(S_FOOT);
      process.stdout.write(`${lines.join('\n')}\n`);
      lastRenderHeight = lines.length;

      const renderedActiveLine = activeLine;
      const renderedActiveLineIndex = activeLineIndex;
      if (renderedActiveLine !== null && renderedActiveLineIndex !== null) {
        lastActiveLineIndex = renderedActiveLineIndex;
        positionEditablePromptCursor(
          lastRenderHeight,
          renderedActiveLineIndex,
          renderedActiveLine.cursorColumn,
        );
        return;
      }

      process.stdout.write('\x1b[?25h');
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

      if (
        key.name === 'left' ||
        key.name === 'right' ||
        key.name === 'backspace' ||
        key.name === 'delete' ||
        isPrintableInput(str, key)
      ) {
        const entry = entries[cursor];
        if (!entry) {
          return;
        }

        const nextState = applyEditableTargetDirectoryInput(
          {
            value: entry.value,
            cursorOffset: entryCursorOffsets[cursor] ?? 0,
          },
          str,
          key,
        );

        entry.value = nextState.value;
        entryCursorOffsets[cursor] = nextState.cursorOffset;
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
  const savedTargetDirectories = await (
    dependencies.readSavedTargetDirectories ?? readSavedTargetDirectories
  )();

  return (dependencies.promptTargetDir ?? editableTargetDirectoryPrompt)({
    message: t('targetDirectory'),
    entries: buildEditableTargetDirectoryOptions(savedTargetDirectories),
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
  const saveTargetDirectory =
    dependencies.saveTargetDirectory ?? addSavedTargetDirectory;

  let selectedNames = skills.map((skill) => skill.directoryName);
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
  let shouldPersistTargetDirectory = false;
  if (!targetDirInput) {
    logPromptHelp(t('targetDirectoryPromptHelp'));
    const response = await promptTargetDir();

    if (p.isCancel(response) || isListPromptCancel(response)) {
      p.cancel(t('installationCancelled'));
      process.exit(0);
    }

    targetDirInput = response;
    shouldPersistTargetDirectory = true;
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
