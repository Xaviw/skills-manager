import * as p from '@clack/prompts';
import pc from 'picocolors';
import { t } from './i18n.js';
import {
  fitOptionText,
  multiselectCancel,
  multiselectTerminalPrompt,
  sanitizeDisplayText,
  truncateDisplayText,
} from './multiselect-prompt.js';

const promptCancel = Symbol('prompt-cancel');
export type PromptCancel = typeof promptCancel;

export interface PromptOption<Value> {
  value: Value;
  label: string;
  hint?: string;
  group?: string;
}

export interface SelectPromptOptions<Value> {
  message: string;
  options: Array<PromptOption<Value>>;
  initialValue?: Value;
}

export interface TextPromptOptions {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
  validate?: (value: string) => string | Error | undefined;
}

export interface MultiselectPromptOptions<Value> {
  message: string;
  options: Array<PromptOption<Value>>;
  initialValues?: Value[];
}

export function isPromptCancel(value: unknown): value is PromptCancel {
  return value === promptCancel;
}

function requireDisplayText(value: string, name: string): string {
  const sanitized = sanitizeDisplayText(value);
  if (!sanitized) {
    throw new TypeError(`${name} must not be empty`);
  }
  return sanitized;
}

function assertInteractiveTerminal(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(t('interactiveTerminalRequired'));
  }
}

async function runClackPrompt<Result>(
  run: () => Promise<Result>,
): Promise<Result> {
  const keypressListeners = new Set(process.stdin.listeners('keypress'));
  const resizeListeners = new Set(process.stdout.listeners('resize'));

  try {
    return await run();
  } catch (error) {
    for (const listener of process.stdin.listeners('keypress')) {
      if (!keypressListeners.has(listener)) {
        process.stdin.removeListener('keypress', listener as () => void);
      }
    }
    for (const listener of process.stdout.listeners('resize')) {
      if (!resizeListeners.has(listener)) {
        process.stdout.removeListener('resize', listener as () => void);
      }
    }
    for (const cleanup of [
      () => process.stdin.unpipe(),
      () => process.stdin.setRawMode(false),
      () => process.stdin.pause(),
      () => process.stdout.write('\x1b[?25h'),
    ]) {
      try {
        cleanup();
      } catch {}
    }
    throw error;
  }
}

export async function textPrompt(
  options: TextPromptOptions,
): Promise<string | PromptCancel> {
  const width = Math.max((process.stdout.columns ?? 80) - 8, 10);
  const message = truncateDisplayText(
    requireDisplayText(options.message, 'message'),
    width,
  );
  const placeholder = options.placeholder
    ? truncateDisplayText(sanitizeDisplayText(options.placeholder), width) ||
      undefined
    : undefined;
  assertInteractiveTerminal();

  const result = await runClackPrompt(() =>
    p.text({ ...options, message, placeholder }),
  );
  return p.isCancel(result) ? promptCancel : result;
}

export async function selectPrompt<Value>(
  options: SelectPromptOptions<Value>,
): Promise<Value | PromptCancel> {
  if (options.options.length === 0) {
    throw new TypeError('options must not be empty');
  }
  if (
    new Set(options.options.map((option) => option.value)).size !==
    options.options.length
  ) {
    throw new TypeError('option values must be unique');
  }
  if (
    Object.hasOwn(options, 'initialValue') &&
    !options.options.some((option) => option.value === options.initialValue)
  ) {
    throw new TypeError('initial value must exist in options');
  }
  const width = Math.max((process.stdout.columns ?? 80) - 8, 10);
  const message = truncateDisplayText(
    requireDisplayText(options.message, 'message'),
    width,
  );
  const sanitizedOptions = options.options.map((option) => {
    const label = requireDisplayText(option.label, 'option labels');
    const hint = option.hint
      ? sanitizeDisplayText(option.hint) || undefined
      : undefined;
    return { ...option, ...fitOptionText(label, hint, width) };
  });
  assertInteractiveTerminal();

  p.log.message(`${pc.dim(t('selectPromptHelp'))}\n`);
  const result = await runClackPrompt(() =>
    p.select({
      message,
      options: sanitizedOptions as p.Option<Value>[],
      initialValue: options.initialValue,
      maxItems: 8,
    }),
  );
  return p.isCancel(result) ? promptCancel : result;
}

export async function multiselectPrompt<Value>(
  options: MultiselectPromptOptions<Value>,
): Promise<Value[] | PromptCancel> {
  if (options.options.length === 0) {
    throw new TypeError('options must not be empty');
  }
  const values = new Set(options.options.map((option) => option.value));
  if (values.size !== options.options.length) {
    throw new TypeError('option values must be unique');
  }
  if (options.initialValues?.some((value) => !values.has(value))) {
    throw new TypeError('initial values must exist in options');
  }

  const message = requireDisplayText(options.message, 'message');
  const sanitizedOptions = options.options.map((option) => ({
    ...option,
    label: requireDisplayText(option.label, 'option labels'),
    hint: option.hint
      ? sanitizeDisplayText(option.hint) || undefined
      : undefined,
    group: option.group
      ? requireDisplayText(option.group, 'option groups')
      : undefined,
  }));
  assertInteractiveTerminal();

  p.log.message(`${pc.dim(t('multiselectPromptHelp'))}\n`);
  const result = await multiselectTerminalPrompt({
    message,
    options: sanitizedOptions,
    initialValues: options.initialValues,
    maxVisible: Math.max(1, Math.min(8, (process.stdout.rows ?? 14) - 6)),
  });
  return result === multiselectCancel ? promptCancel : result;
}
