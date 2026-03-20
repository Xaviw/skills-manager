import * as readline from 'node:readline';
import { stripVTControlCharacters } from 'node:util';
import { Writable } from 'node:stream';
import pc from 'picocolors';
import { t } from './i18n.js';

export interface ListPromptOption<Value> {
  value: Value;
  label: string;
  hint?: string;
}

export interface SelectListPromptOptions<Value> {
  message: string;
  options: Array<ListPromptOption<Value>>;
  initialValue?: Value;
  maxVisible?: number;
}

export interface MultiselectListPromptOptions<Value> {
  message: string;
  options: Array<ListPromptOption<Value>>;
  initialValues?: Value[];
  maxVisible?: number;
  required?: boolean;
}

export const listPromptCancelSymbol = Symbol('list-prompt-cancel');

const S_STEP_ACTIVE = pc.green('◆');
const S_STEP_CANCEL = pc.red('■');
const S_STEP_SUBMIT = pc.green('◇');
const S_BAR = pc.dim('│');
const S_FOOT = pc.dim('└');
const S_POINTER = pc.cyan('❯');
const S_SELECTED = pc.green('●');
const S_UNSELECTED = pc.dim('○');

const silentOutput = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});

const extendedPictographicPattern = /\p{Extended_Pictographic}/u;

function stripAnsi(value: string): string {
  return stripVTControlCharacters(value);
}

function normalizeDisplayText(value: string): string {
  return stripAnsi(value).replace(/\s+/g, ' ').trim();
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

  // Combining marks.
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  ) {
    return 0;
  }

  // Treat emoji presentation code points as double-width.
  if (
    extendedPictographicPattern.test(String.fromCodePoint(codePoint)) ||
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff)
  ) {
    return 2;
  }

  // Treat known full-width / CJK ranges as double-width.
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

export function measureDisplayWidth(value: string): number {
  const plain = stripAnsi(value);
  let width = 0;

  for (const char of plain) {
    width += getCodePointWidth(char.codePointAt(0) ?? 0);
  }

  return width;
}

export function truncateDisplayText(value: string, maxWidth: number): string {
  const plain = normalizeDisplayText(value);
  if (!plain) {
    return '';
  }

  if (maxWidth <= 0) {
    return '';
  }

  if (measureDisplayWidth(plain) <= maxWidth) {
    return plain;
  }

  const ellipsis = maxWidth <= 3 ? '.'.repeat(maxWidth) : '...';
  const targetWidth = Math.max(0, maxWidth - measureDisplayWidth(ellipsis));

  if (targetWidth <= 0) {
    return ellipsis;
  }

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

export function isListPromptCancel(
  value: unknown,
): value is typeof listPromptCancelSymbol {
  return value === listPromptCancelSymbol;
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

export function fitOptionText(
  label: string,
  hint: string | undefined,
  maxWidth: number,
): { label: string; hint?: string } {
  const normalizedLabel = normalizeDisplayText(label);
  const normalizedHint = hint ? normalizeDisplayText(hint) : undefined;

  if (!normalizedLabel || maxWidth <= 0) {
    return { label: '' };
  }

  if (!normalizedHint) {
    return { label: truncateDisplayText(normalizedLabel, maxWidth) };
  }

  const labelWidth = measureDisplayWidth(normalizedLabel);
  const hintWrapperWidth = measureDisplayWidth(' ()');
  const availableHintWidth =
    maxWidth - Math.min(labelWidth, maxWidth) - hintWrapperWidth;

  if (labelWidth >= maxWidth || availableHintWidth < 5) {
    return { label: truncateDisplayText(normalizedLabel, maxWidth) };
  }

  const fittedHint = truncateDisplayText(normalizedHint, availableHintWidth);
  if (!fittedHint) {
    return { label: truncateDisplayText(normalizedLabel, maxWidth) };
  }

  return {
    label: normalizedLabel,
    hint: fittedHint,
  };
}

export function formatOverflowSummary(
  hiddenBefore: number,
  hiddenAfter: number,
  locale?: 'en' | 'zh',
): string {
  const parts: string[] = [];
  if (hiddenBefore > 0) {
    parts.push(t('promptMoreAbove', { count: hiddenBefore }, locale));
  }
  if (hiddenAfter > 0) {
    parts.push(t('promptMoreBelow', { count: hiddenAfter }, locale));
  }
  return parts.join(' · ');
}

export function summarizeSelectedLabels(
  labels: string[],
  locale?: 'en' | 'zh',
): string {
  if (labels.length === 0) {
    return t('none', {}, locale);
  }

  if (labels.length <= 3) {
    return labels.join(', ');
  }

  return `${labels.slice(0, 3).join(', ')} ${t('promptSummaryMore', { count: labels.length - 3 }, locale)}`;
}

function buildOptionLine(
  prefix: string,
  marker: string,
  label: string,
  hint: string | undefined,
  maxWidth: number,
  highlightLabel = false,
): string {
  const markerWidth = measureDisplayWidth(marker);
  const availableWidth = Math.max(
    0,
    maxWidth - measureDisplayWidth(prefix) - markerWidth,
  );
  const fitted = fitOptionText(label, hint, availableWidth);
  const renderedLabel = highlightLabel ? pc.bold(fitted.label) : fitted.label;
  const renderedHint = fitted.hint ? pc.dim(` (${fitted.hint})`) : '';
  return `${prefix}${marker}${renderedLabel}${renderedHint}`;
}

function getSafeTerminalWidth(): number {
  return Math.max((process.stdout.columns ?? 80) - 4, 20);
}

async function runListPrompt<Value>(options: {
  message: string;
  options: Array<ListPromptOption<Value>>;
  maxVisible: number;
  selected: Set<Value>;
  cursor: number;
  required: boolean;
  mode: 'single' | 'multiple';
}): Promise<Value | Value[] | symbol> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: silentOutput,
      terminal: false,
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(process.stdin, rl);

    let cursor = options.cursor;
    let lastRenderHeight = 0;

    const cleanup = (): void => {
      process.stdin.removeListener('keypress', keypressHandler);
      process.stdout.off('resize', resizeHandler);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      rl.close();
    };

    const render = (state: 'active' | 'submit' | 'cancel' = 'active'): void => {
      clearRender(lastRenderHeight);

      const width = getSafeTerminalWidth();
      const lines: string[] = [];
      const headerPrefix =
        state === 'active'
          ? `${S_STEP_ACTIVE} `
          : state === 'submit'
            ? `${S_STEP_SUBMIT} `
            : `${S_STEP_CANCEL} `;
      lines.push(buildLine(headerPrefix, options.message, width, pc.bold));
      lines.push(S_BAR);

      if (state === 'active') {
        if (options.options.length === 0) {
          lines.push(
            buildLine(`${S_BAR}  `, t('promptNoOptions'), width, pc.dim),
          );
        } else {
          const maxVisible = Math.min(
            options.maxVisible,
            options.options.length,
          );
          const visibleStart = Math.max(
            0,
            Math.min(
              cursor - Math.floor(maxVisible / 2),
              options.options.length - maxVisible,
            ),
          );
          const visibleEnd = Math.min(
            options.options.length,
            visibleStart + maxVisible,
          );

          for (let index = visibleStart; index < visibleEnd; index += 1) {
            const option = options.options[index]!;
            const isCursor = index === cursor;
            const isSelected = options.selected.has(option.value);
            const prefix = isCursor ? `${S_BAR} ${S_POINTER} ` : `${S_BAR}   `;
            const marker = isSelected ? `${S_SELECTED} ` : `${S_UNSELECTED} `;

            lines.push(
              buildOptionLine(
                prefix,
                marker,
                option.label,
                option.hint,
                width,
                isCursor,
              ),
            );
          }

          const hiddenBefore = visibleStart;
          const hiddenAfter = options.options.length - visibleEnd;
          if (hiddenBefore > 0 || hiddenAfter > 0) {
            lines.push(
              buildLine(
                `${S_BAR}  `,
                formatOverflowSummary(hiddenBefore, hiddenAfter),
                width,
                pc.dim,
              ),
            );
          }
        }

        if (options.mode === 'multiple') {
          lines.push(S_BAR);
          lines.push(
            buildLine(
              `${S_BAR}  `,
              t('promptSelectedCount', { count: options.selected.size }),
              width,
              pc.green,
            ),
          );
        }
      } else if (state === 'submit') {
        if (options.mode === 'single') {
          const selectedOption = options.options.find((option) =>
            options.selected.has(option.value),
          );
          lines.push(
            buildLine(
              `${S_BAR}  `,
              selectedOption?.label ?? t('none'),
              width,
              pc.dim,
            ),
          );
        } else {
          const selectedLabels = options.options
            .filter((option) => options.selected.has(option.value))
            .map((option) => option.label);
          lines.push(
            buildLine(
              `${S_BAR}  `,
              summarizeSelectedLabels(selectedLabels),
              width,
              pc.dim,
            ),
          );
        }
      } else {
        lines.push(
          buildLine(`${S_BAR}  `, t('promptCancelled'), width, pc.dim),
        );
      }

      lines.push(S_FOOT);
      process.stdout.write(`${lines.join('\n')}\n`);
      lastRenderHeight = lines.length;
    };

    const submit = (): void => {
      if (
        options.mode === 'multiple' &&
        options.required &&
        options.selected.size === 0
      ) {
        return;
      }

      render('submit');
      cleanup();

      if (options.mode === 'single') {
        const selectedOption = options.options.find((option) =>
          options.selected.has(option.value),
        );
        resolve(selectedOption?.value ?? listPromptCancelSymbol);
        return;
      }

      resolve(
        options.options
          .filter((option) => options.selected.has(option.value))
          .map((option) => option.value),
      );
    };

    const cancel = (): void => {
      render('cancel');
      cleanup();
      resolve(listPromptCancelSymbol);
    };

    const resizeHandler = (): void => {
      render();
    };

    const keypressHandler = (_str: string, key: readline.Key): void => {
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

      if (options.options.length === 0) {
        render();
        return;
      }

      if (key.name === 'up') {
        cursor = Math.max(0, cursor - 1);
        render();
        return;
      }

      if (key.name === 'down') {
        cursor = Math.min(options.options.length - 1, cursor + 1);
        render();
        return;
      }

      if (options.mode === 'multiple' && key.name === 'space') {
        const option = options.options[cursor];
        if (!option) {
          return;
        }

        if (options.selected.has(option.value)) {
          options.selected.delete(option.value);
        } else {
          options.selected.add(option.value);
        }
        render();
        return;
      }

      if (options.mode === 'multiple' && key.name?.toLowerCase() === 'a') {
        if (options.selected.size === options.options.length) {
          options.selected.clear();
        } else {
          options.selected.clear();
          for (const option of options.options) {
            options.selected.add(option.value);
          }
        }
        render();
        return;
      }

      if (
        options.mode === 'single' &&
        (key.name === 'space' || key.name === 'right')
      ) {
        const option = options.options[cursor];
        if (!option) {
          return;
        }

        options.selected.clear();
        options.selected.add(option.value);
        render();
      }
    };

    process.stdout.on('resize', resizeHandler);
    process.stdin.on('keypress', keypressHandler);

    render();
  });
}

export async function selectListPrompt<Value>(
  options: SelectListPromptOptions<Value>,
): Promise<Value | symbol> {
  const initialIndex = Math.max(
    0,
    options.options.findIndex(
      (option) => option.value === options.initialValue,
    ),
  );
  const selected = new Set<Value>();
  const initialOption = options.options[initialIndex];
  if (initialOption) {
    selected.add(initialOption.value);
  }

  return (await runListPrompt({
    message: options.message,
    options: options.options,
    maxVisible: options.maxVisible ?? 8,
    selected,
    cursor: initialIndex,
    required: true,
    mode: 'single',
  })) as Value | symbol;
}

export async function multiselectListPrompt<Value>(
  options: MultiselectListPromptOptions<Value>,
): Promise<Value[] | symbol> {
  return (await runListPrompt({
    message: options.message,
    options: options.options,
    maxVisible: options.maxVisible ?? 8,
    selected: new Set(options.initialValues ?? []),
    cursor: 0,
    required: options.required ?? true,
    mode: 'multiple',
  })) as Value[] | symbol;
}
