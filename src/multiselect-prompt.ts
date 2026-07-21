import * as readline from 'node:readline';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import pc from 'picocolors';
import { t } from './i18n.js';

interface MultiselectOption<Value> {
  value: Value;
  label: string;
  hint?: string;
  group?: string;
}

interface GroupRow {
  type: 'group';
  label: string;
  optionIndexes: number[];
}

interface OptionRow {
  type: 'option';
  optionIndex: number;
  groupRowIndex?: number;
}

type NavigationRow = GroupRow | OptionRow;

interface MultiselectTerminalPromptOptions<Value> {
  message: string;
  options: Array<MultiselectOption<Value>>;
  initialValues?: Value[];
  maxVisible: number;
}

export const multiselectCancel = Symbol('multiselect-cancel');

const S_STEP_ACTIVE = pc.green('◆');
const S_STEP_CANCEL = pc.red('■');
const S_STEP_SUBMIT = pc.green('◇');
const S_BAR = pc.dim('│');
const S_FOOT = pc.dim('└');
const S_POINTER = pc.cyan('❯');
const S_SELECTED = pc.green('●');
const S_UNSELECTED = pc.dim('○');
const S_PARTIAL = pc.yellow('◐');

const silentOutput = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});

const extendedPictographicPattern = /\p{Extended_Pictographic}/u;

export function sanitizeDisplayText(value: string): string {
  return stripVTControlCharacters(value).replace(/\s+/g, ' ').trim();
}

function getCodePointWidth(codePoint: number): number {
  if (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x200d ||
    codePoint === 0xfe0e ||
    codePoint === 0xfe0f
  ) {
    return 0;
  }

  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  ) {
    return 0;
  }

  if (
    extendedPictographicPattern.test(String.fromCodePoint(codePoint)) ||
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff)
  ) {
    return 2;
  }

  if (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0x3247 && codePoint !== 0x303f) ||
      (codePoint >= 0x3250 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0xa4c6) ||
      (codePoint >= 0xa960 && codePoint <= 0xa97c) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6b) ||
      (codePoint >= 0xff01 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1b000 && codePoint <= 0x1b001) ||
      (codePoint >= 0x1f200 && codePoint <= 0x1f251) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  ) {
    return 2;
  }

  return 1;
}

function measureDisplayWidth(value: string): number {
  let width = 0;
  for (const char of stripVTControlCharacters(value)) {
    width += getCodePointWidth(char.codePointAt(0) ?? 0);
  }
  return width;
}

export function truncateDisplayText(value: string, maxWidth: number): string {
  const plain = sanitizeDisplayText(value);
  if (!plain || maxWidth <= 0) {
    return '';
  }
  if (measureDisplayWidth(plain) <= maxWidth) {
    return plain;
  }

  const ellipsis = maxWidth <= 3 ? '.'.repeat(maxWidth) : '...';
  const targetWidth = Math.max(0, maxWidth - measureDisplayWidth(ellipsis));
  let result = '';
  let width = 0;

  for (const char of plain) {
    const charWidth = getCodePointWidth(char.codePointAt(0) ?? 0);
    if (width + charWidth > targetWidth) {
      break;
    }
    result += char;
    width += charWidth;
  }

  return `${result.trimEnd()}${ellipsis}`;
}

export function fitOptionText(
  label: string,
  hint: string | undefined,
  maxWidth: number,
): { label: string; hint?: string } {
  const normalizedLabel = sanitizeDisplayText(label);
  const normalizedHint = hint ? sanitizeDisplayText(hint) : undefined;
  if (!normalizedLabel || maxWidth <= 0) {
    return { label: '' };
  }
  if (!normalizedHint) {
    return { label: truncateDisplayText(normalizedLabel, maxWidth) };
  }

  const labelWidth = measureDisplayWidth(normalizedLabel);
  const availableHintWidth =
    maxWidth - Math.min(labelWidth, maxWidth) - measureDisplayWidth(' ()');
  if (labelWidth >= maxWidth || availableHintWidth < 5) {
    return { label: truncateDisplayText(normalizedLabel, maxWidth) };
  }

  const fittedHint = truncateDisplayText(normalizedHint, availableHintWidth);
  return fittedHint
    ? { label: normalizedLabel, hint: fittedHint }
    : { label: truncateDisplayText(normalizedLabel, maxWidth) };
}

function clearRender(lastRenderHeight: number): void {
  if (lastRenderHeight <= 0) {
    return;
  }
  process.stdout.write(`\x1b[${lastRenderHeight}A`);
  for (let index = 0; index < lastRenderHeight; index += 1) {
    process.stdout.write('\x1b[2K\x1b[1B');
  }
  process.stdout.write(`\x1b[${lastRenderHeight}A`);
}

function buildLine(
  prefix: string,
  content: string,
  maxWidth: number,
  style: (value: string) => string = (value) => value,
): string {
  const availableWidth = Math.max(0, maxWidth - measureDisplayWidth(prefix));
  return `${prefix}${style(truncateDisplayText(content, availableWidth))}`;
}

function buildOptionLine(
  prefix: string,
  marker: string,
  option: MultiselectOption<unknown>,
  maxWidth: number,
  highlighted: boolean,
): string {
  const availableWidth = Math.max(
    0,
    maxWidth - measureDisplayWidth(prefix) - measureDisplayWidth(marker),
  );
  const fitted = fitOptionText(option.label, option.hint, availableWidth);
  const label = highlighted ? pc.bold(fitted.label) : fitted.label;
  const hint = fitted.hint ? pc.dim(` (${fitted.hint})`) : '';
  return `${prefix}${marker}${label}${hint}`;
}

function summarizeSelectedLabels(labels: string[]): string {
  if (labels.length <= 3) {
    return labels.join(', ');
  }
  return `${labels.slice(0, 3).join(', ')} ${t('promptSummaryMore', { count: labels.length - 3 })}`;
}

function buildNavigationRows<Value>(
  options: Array<MultiselectOption<Value>>,
): NavigationRow[] {
  const rows: NavigationRow[] = [];
  let currentGroup: string | undefined;
  let groupRow: GroupRow | undefined;
  let groupRowIndex: number | undefined;

  for (const [optionIndex, option] of options.entries()) {
    if (option.group !== currentGroup) {
      currentGroup = option.group;
      groupRow = option.group
        ? { type: 'group', label: option.group, optionIndexes: [] }
        : undefined;
      groupRowIndex = groupRow ? rows.push(groupRow) - 1 : undefined;
    }
    groupRow?.optionIndexes.push(optionIndex);
    rows.push({ type: 'option', optionIndex, groupRowIndex });
  }

  return rows;
}

export async function multiselectTerminalPrompt<Value>(
  options: MultiselectTerminalPromptOptions<Value>,
): Promise<Value[] | typeof multiselectCancel> {
  return await new Promise((resolve, reject) => {
    const selected = new Set(options.initialValues ?? []);
    const navigationRows = buildNavigationRows(options.options);
    const rl = readline.createInterface({
      input: process.stdin,
      output: silentOutput,
      terminal: false,
    });
    let cursor = 0;
    let lastRenderHeight = 0;
    let settled = false;

    const cleanup = (): unknown => {
      let cleanupError: unknown;
      const attempt = (action: () => void): void => {
        try {
          action();
        } catch (error) {
          cleanupError ??= error;
        }
      };

      attempt(() => process.stdin.removeListener('keypress', keypressHandler));
      attempt(() => process.stdout.removeListener('resize', resizeHandler));
      attempt(() => {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
      });
      attempt(() => process.stdin.pause());
      attempt(() => rl.close());
      return cleanupError;
    };

    const finish = (result: Value[] | typeof multiselectCancel): void => {
      if (settled) {
        return;
      }
      settled = true;
      const cleanupError = cleanup();
      if (cleanupError) {
        reject(cleanupError);
      } else {
        resolve(result);
      }
    };

    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const render = (state: 'active' | 'submit' | 'cancel' = 'active'): void => {
      clearRender(lastRenderHeight);
      const width = Math.max((process.stdout.columns ?? 80) - 4, 20);
      const step =
        state === 'active'
          ? S_STEP_ACTIVE
          : state === 'submit'
            ? S_STEP_SUBMIT
            : S_STEP_CANCEL;
      const lines = [
        buildLine(`${step} `, options.message, width, pc.bold),
        S_BAR,
      ];

      if (state === 'active') {
        const visibleCount = Math.min(
          options.maxVisible,
          navigationRows.length,
        );
        const getVisibleStart = (count: number): number =>
          Math.max(
            0,
            Math.min(
              cursor - Math.floor(count / 2),
              navigationRows.length - count,
            ),
          );
        let visibleStart = getVisibleStart(visibleCount);
        const cursorRow = navigationRows[cursor];
        const pinnedGroupIndex =
          visibleCount >= 3 &&
          cursorRow?.type === 'option' &&
          cursorRow.groupRowIndex !== undefined &&
          cursorRow.groupRowIndex < visibleStart
            ? cursorRow.groupRowIndex
            : undefined;
        if (pinnedGroupIndex !== undefined) {
          visibleStart = getVisibleStart(visibleCount - 1);
        }
        const visibleIndexes = Array.from(
          {
            length: visibleCount - (pinnedGroupIndex === undefined ? 0 : 1),
          },
          (_, index) => visibleStart + index,
        ).filter((index) => index < navigationRows.length);
        if (pinnedGroupIndex !== undefined) {
          visibleIndexes.unshift(pinnedGroupIndex);
        }
        const getRenderedNavigationHeight = (): number =>
          visibleIndexes.length +
          (pinnedGroupIndex === undefined ? 0 : 1) +
          visibleIndexes.filter(
            (index, position) =>
              position > 0 && navigationRows[index]?.type === 'group',
          ).length;
        while (getRenderedNavigationHeight() > visibleCount) {
          const removable = visibleIndexes.filter(
            (index) => index !== cursor && index !== pinnedGroupIndex,
          );
          const first = removable[0];
          const last = removable.at(-1);
          if (first === undefined || last === undefined) {
            break;
          }
          const indexToRemove = cursor - first >= last - cursor ? first : last;
          visibleIndexes.splice(visibleIndexes.indexOf(indexToRemove), 1);
        }

        let previousRow: NavigationRow | undefined;
        for (const index of visibleIndexes) {
          const row = navigationRows[index]!;
          const highlighted = index === cursor;
          if (row.type === 'group') {
            if (previousRow) {
              lines.push(S_BAR);
            }
            const selectedCount = row.optionIndexes.filter((optionIndex) =>
              selected.has(options.options[optionIndex]!.value),
            ).length;
            const marker =
              selectedCount === 0
                ? `${S_UNSELECTED} `
                : selectedCount === row.optionIndexes.length
                  ? `${S_SELECTED} `
                  : `${S_PARTIAL} `;
            lines.push(
              buildOptionLine(
                highlighted ? `${S_BAR} ${S_POINTER} ` : `${S_BAR}   `,
                marker,
                { value: row.label, label: row.label },
                width,
                highlighted,
              ),
            );
            if (index === pinnedGroupIndex) {
              lines.push(buildLine(`${S_BAR}  `, '...', width, pc.dim));
            }
            previousRow = row;
            continue;
          }

          const option = options.options[row.optionIndex]!;
          lines.push(
            buildOptionLine(
              highlighted ? `${S_BAR} ${S_POINTER}   ` : `${S_BAR}     `,
              selected.has(option.value)
                ? `${S_SELECTED} `
                : `${S_UNSELECTED} `,
              option,
              width,
              highlighted,
            ),
          );
          previousRow = row;
        }
        if (
          visibleStart > 0 ||
          visibleIndexes.at(-1)! < navigationRows.length - 1
        ) {
          lines.push(buildLine(`${S_BAR}  `, '...', width, pc.dim));
        }
        lines.push(S_BAR);
        lines.push(
          buildLine(
            `${S_BAR}  `,
            t('promptSelectedCount', { count: selected.size }),
            width,
            pc.green,
          ),
        );
      } else if (state === 'submit') {
        const labels = options.options
          .filter((option) => selected.has(option.value))
          .map((option) => option.label);
        lines.push(
          buildLine(
            `${S_BAR}  `,
            summarizeSelectedLabels(labels),
            width,
            pc.dim,
          ),
        );
      } else {
        lines.push(
          buildLine(`${S_BAR}  `, t('promptCancelled'), width, pc.dim),
        );
      }

      lines.push(S_FOOT);
      process.stdout.write(`${lines.join('\n')}\n`);
      lastRenderHeight = lines.length;
    };

    const safely = (action: () => void): void => {
      try {
        action();
      } catch (error) {
        fail(error);
      }
    };

    const submit = (): void => {
      if (selected.size === 0) {
        return;
      }
      render('submit');
      finish(
        options.options
          .filter((option) => selected.has(option.value))
          .map((option) => option.value),
      );
    };

    const cancel = (): void => {
      render('cancel');
      finish(multiselectCancel);
    };

    function resizeHandler(): void {
      safely(() => render());
    }

    function keypressHandler(_value: string, key: readline.Key): void {
      safely(() => {
        if (!key) {
          return;
        }
        if (key.name === 'return') {
          submit();
        } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          cancel();
        } else if (key.name === 'up') {
          cursor = (cursor - 1 + navigationRows.length) % navigationRows.length;
          render();
        } else if (key.name === 'down') {
          cursor = (cursor + 1) % navigationRows.length;
          render();
        } else if (key.name === 'space') {
          const row = navigationRows[cursor]!;
          if (row.type === 'group') {
            const values = row.optionIndexes.map(
              (optionIndex) => options.options[optionIndex]!.value,
            );
            if (values.every((value) => selected.has(value))) {
              values.forEach((value) => selected.delete(value));
            } else {
              values.forEach((value) => selected.add(value));
            }
          } else {
            const option = options.options[row.optionIndex]!;
            if (selected.has(option.value)) {
              selected.delete(option.value);
            } else {
              selected.add(option.value);
            }
          }
          render();
        } else if (key.name?.toLowerCase() === 'a') {
          if (selected.size === options.options.length) {
            selected.clear();
          } else {
            options.options.forEach((option) => selected.add(option.value));
          }
          render();
        }
      });
    }

    safely(() => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      readline.emitKeypressEvents(process.stdin, rl);
      process.stdout.on('resize', resizeHandler);
      process.stdin.on('keypress', keypressHandler);
      render();
    });
  });
}
