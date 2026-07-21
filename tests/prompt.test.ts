import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stripVTControlCharacters } from 'node:util';
import { t } from '../src/i18n.js';
import {
  isPromptCancel,
  multiselectPrompt,
  selectPrompt,
  textPrompt,
} from '../src/prompt.js';

describe('Prompt facade', () => {
  let originalInputIsTTY: PropertyDescriptor | undefined;
  let originalOutputIsTTY: PropertyDescriptor | undefined;
  let originalColumns: PropertyDescriptor | undefined;
  let originalRows: PropertyDescriptor | undefined;
  let originalSetRawMode: typeof process.stdin.setRawMode | undefined;

  beforeEach(() => {
    originalInputIsTTY = Object.getOwnPropertyDescriptor(
      process.stdin,
      'isTTY',
    );
    originalOutputIsTTY = Object.getOwnPropertyDescriptor(
      process.stdout,
      'isTTY',
    );
    originalColumns = Object.getOwnPropertyDescriptor(
      process.stdout,
      'columns',
    );
    originalRows = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
    originalSetRawMode = process.stdin.setRawMode;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'columns', {
      value: 80,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'rows', {
      value: 24,
      configurable: true,
    });
    process.stdin.setRawMode = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();

    for (const [target, key, descriptor] of [
      [process.stdin, 'isTTY', originalInputIsTTY],
      [process.stdout, 'isTTY', originalOutputIsTTY],
      [process.stdout, 'columns', originalColumns],
      [process.stdout, 'rows', originalRows],
    ] as const) {
      if (descriptor) {
        Object.defineProperty(target, key, descriptor);
      } else {
        Reflect.deleteProperty(target, key);
      }
    }

    process.stdin.setRawMode = originalSetRawMode as never;
  });

  it('rejects an empty option list before starting a prompt', async () => {
    await expect(
      selectPrompt({ message: 'Select a skill', options: [] }),
    ).rejects.toThrow('options must not be empty');
  });

  it('rejects duplicate option values', async () => {
    await expect(
      selectPrompt({
        message: 'Select a skill',
        options: [
          { value: 'same', label: 'First' },
          { value: 'same', label: 'Second' },
        ],
      }),
    ).rejects.toThrow('option values must be unique');
  });

  it('rejects an unknown initial value', async () => {
    await expect(
      selectPrompt({
        message: 'Select a skill',
        options: [{ value: 'known', label: 'Known' }],
        initialValue: 'missing',
      }),
    ).rejects.toThrow('initial value must exist in options');
  });

  it('rejects a prompt when no interactive terminal is available', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });

    await expect(
      selectPrompt({
        message: 'Select a skill',
        options: [{ value: 'skill', label: 'Skill' }],
      }),
    ).rejects.toThrow(t('interactiveTerminalRequired'));
  });

  it('submits a Clack select and restores terminal listeners', async () => {
    const listenerCount = process.stdin.listenerCount('keypress');
    const resultPromise = selectPrompt({
      message: 'Select a skill',
      options: [
        { value: 'first', label: 'First' },
        { value: 'second', label: 'Second' },
      ],
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'down' });
    process.stdin.emit('keypress', '', { name: 'return' });

    await expect(resultPromise).resolves.toBe('second');
    expect(process.stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(process.stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(process.stdin.listenerCount('keypress')).toBe(listenerCount);
  });

  it('cleans up when a Clack select renderer fails', async () => {
    const keypressListeners = new Set(process.stdin.listeners('keypress'));
    const resizeListeners = new Set(process.stdout.listeners('resize'));
    const rendererError = new Error('renderer failed');
    vi.mocked(process.stdout.write).mockImplementation((chunk) => {
      if (String(chunk).includes('Select a skill')) {
        throw rendererError;
      }
      return true;
    });

    try {
      await expect(
        selectPrompt({
          message: 'Select a skill',
          options: [{ value: 'skill', label: 'Skill' }],
        }),
      ).rejects.toBe(rendererError);
      expect(process.stdin.setRawMode).toHaveBeenLastCalledWith(false);
      expect(process.stdin.listenerCount('keypress')).toBe(
        keypressListeners.size,
      );
      expect(process.stdout.listenerCount('resize')).toBe(resizeListeners.size);
    } finally {
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
      process.stdin.unpipe();
      process.stdin.pause();
    }
  });

  it('maps Clack cancellation to the Prompt cancel result', async () => {
    const resultPromise = selectPrompt({
      message: 'Select a skill',
      options: [{ value: 'skill', label: 'Skill' }],
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'escape' });

    expect(isPromptCancel(await resultPromise)).toBe(true);
  });

  it('sanitizes select text and prints localized key help', async () => {
    const resultPromise = selectPrompt({
      message: '\x1b[31mSelect\n  a skill\x1b[0m',
      options: [
        {
          value: 'skill',
          label: '\x1b]0;unsafe\x07Skill\n  one',
          hint: 'First\n  description',
        },
      ],
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'return' });
    await resultPromise;

    const output = stripVTControlCharacters(
      vi
        .mocked(process.stdout.write)
        .mock.calls.map(([chunk]) => String(chunk))
        .join(''),
    );
    expect(output).toContain(t('selectPromptHelp'));
    expect(output).toContain('Select a skill');
    expect(output).toContain('Skill one');
    expect(output).toContain('First description');
    expect(output).not.toContain('unsafe');
  });

  it('truncates a long Chinese hint to the terminal width', async () => {
    Object.defineProperty(process.stdout, 'columns', {
      value: 30,
      configurable: true,
    });
    const hint = '这是一段很长的中文技能说明'.repeat(5);
    const resultPromise = selectPrompt({
      message: '选择技能',
      options: [{ value: 'skill', label: '技能', hint }],
    });

    await new Promise((resolve) => setImmediate(resolve));
    const output = stripVTControlCharacters(
      vi
        .mocked(process.stdout.write)
        .mock.calls.map(([chunk]) => String(chunk))
        .join(''),
    );
    process.stdin.emit('keypress', '', { name: 'return' });
    await resultPromise;

    expect(output).toContain('...');
    expect(output).not.toContain(hint);
  });

  it('returns text input without trimming it', async () => {
    const resultPromise = textPrompt({
      message: 'Directory name',
      initialValue: '  custom path  ',
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'return' });

    await expect(resultPromise).resolves.toBe('  custom path  ');
  });

  it('truncates text prompt display values to the terminal width', async () => {
    Object.defineProperty(process.stdout, 'columns', {
      value: 30,
      configurable: true,
    });
    const message = '这是一段很长的文本输入提示'.repeat(4);
    const placeholder = 'this placeholder is much too long for the terminal';
    const resultPromise = textPrompt({ message, placeholder });

    await new Promise((resolve) => setImmediate(resolve));
    const output = stripVTControlCharacters(
      vi
        .mocked(process.stdout.write)
        .mock.calls.map(([chunk]) => String(chunk))
        .join(''),
    );
    process.stdin.emit('keypress', '', { name: 'return' });
    await resultPromise;

    expect(output).toContain('...');
    expect(output).not.toContain(message);
    expect(output).not.toContain(placeholder);
  });

  it('returns multiselect values in option order', async () => {
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: [
        { value: 'first', label: 'First' },
        { value: 'second', label: 'Second' },
        { value: 'third', label: 'Third' },
      ],
      initialValues: ['third'],
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'space' });
    process.stdin.emit('keypress', '', { name: 'return' });

    await expect(resultPromise).resolves.toEqual(['first', 'third']);
  });

  it('selects every child when a group row is toggled', async () => {
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: [
        { value: 'a-1', label: 'A 1', group: 'A' },
        { value: 'a-2', label: 'A 2', group: 'A' },
        { value: 'b-1', label: 'B 1', group: 'B' },
      ],
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'space' });
    process.stdin.emit('keypress', '', { name: 'return' });

    await expect(resultPromise).resolves.toEqual(['a-1', 'a-2']);
  });

  it('derives partial group state and keeps global selection behavior', async () => {
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: [
        { value: 'a-1', label: 'A 1', group: 'A' },
        { value: 'a-2', label: 'A 2', group: 'A' },
        { value: 'b-1', label: 'B 1', group: 'B' },
      ],
      initialValues: ['a-1'],
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'down' });
    process.stdin.emit('keypress', '', { name: 'space' });
    process.stdin.emit('keypress', '', { name: 'a' });
    process.stdin.emit('keypress', '', { name: 'return' });

    await expect(resultPromise).resolves.toEqual(['a-1', 'a-2', 'b-1']);
    const output = stripVTControlCharacters(
      vi
        .mocked(process.stdout.write)
        .mock.calls.map(([chunk]) => String(chunk))
        .join(''),
    );
    expect(output).toContain('◐ A');
    expect(output).toContain('○ A');
    expect(output).toContain('● A');
  });

  it('keeps the current group visible while scrolling a long group', async () => {
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: Array.from({ length: 10 }, (_, index) => ({
        value: index + 1,
        label: `A ${index + 1}`,
        group: 'A',
      })),
    });

    await new Promise((resolve) => setImmediate(resolve));
    for (let index = 0; index < 10; index += 1) {
      process.stdin.emit('keypress', '', { name: 'down' });
    }
    const output = stripVTControlCharacters(
      String(vi.mocked(process.stdout.write).mock.calls.at(-1)?.[0] ?? ''),
    );
    process.stdin.emit('keypress', '', { name: 'escape' });
    await resultPromise;

    expect(output).toContain('○ A');
    expect(output).toContain('A 10');
    expect(output).toContain('...');
  });

  it('keeps grouped rendering within the terminal height', async () => {
    Object.defineProperty(process.stdout, 'rows', {
      value: 10,
      configurable: true,
    });
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: [
        { value: 'a-1', label: 'A 1', group: 'A' },
        { value: 'a-2', label: 'A 2', group: 'A' },
        { value: 'b-1', label: 'B 1', group: 'B' },
      ],
    });

    await new Promise((resolve) => setImmediate(resolve));
    const output = String(
      vi.mocked(process.stdout.write).mock.calls.at(-1)?.[0] ?? '',
    );
    process.stdin.emit('keypress', '', { name: 'escape' });
    await resultPromise;

    expect(output.trimEnd().split('\n').length).toBeLessThanOrEqual(10);
  });

  it('keeps the focused grouped option visible at minimum height', async () => {
    Object.defineProperty(process.stdout, 'rows', {
      value: 7,
      configurable: true,
    });
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: [
        { value: 'a-1', label: 'A 1', group: 'A' },
        { value: 'a-2', label: 'A 2', group: 'A' },
      ],
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'down' });
    const output = stripVTControlCharacters(
      String(vi.mocked(process.stdout.write).mock.calls.at(-1)?.[0] ?? ''),
    );
    process.stdin.emit('keypress', '', { name: 'escape' });
    await resultPromise;

    expect(output).toContain('A 1');
    expect(output.trimEnd().split('\n').length).toBeLessThanOrEqual(7);
  });

  it('bounds the submitted multiselect summary', async () => {
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: Array.from({ length: 5 }, (_, index) => ({
        value: index + 1,
        label: `Skill ${index + 1}`,
      })),
      initialValues: [1, 2, 3, 4, 5],
    });

    await new Promise((resolve) => setImmediate(resolve));
    vi.mocked(process.stdout.write).mockClear();
    process.stdin.emit('keypress', '', { name: 'return' });
    await resultPromise;

    const output = stripVTControlCharacters(
      vi
        .mocked(process.stdout.write)
        .mock.calls.map(([chunk]) => String(chunk))
        .join(''),
    );
    expect(output).toContain('Skill 1, Skill 2, Skill 3');
    expect(output).toContain(t('promptSummaryMore', { count: 2 }));
    expect(output).not.toContain('Skill 4');
    expect(output).not.toContain('Skill 5');
  });

  it('wraps multiselect navigation from the first option to the last', async () => {
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: [
        { value: 'first', label: 'First' },
        { value: 'last', label: 'Last' },
      ],
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'up' });
    process.stdin.emit('keypress', '', { name: 'space' });
    process.stdin.emit('keypress', '', { name: 'return' });

    await expect(resultPromise).resolves.toEqual(['last']);
  });

  it('maps multiselect Ctrl+C to the Prompt cancel result', async () => {
    const listenerCount = process.stdin.listenerCount('keypress');
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: [{ value: 'skill', label: 'Skill' }],
    });

    await new Promise((resolve) => setImmediate(resolve));
    process.stdin.emit('keypress', '', { name: 'c', ctrl: true });

    expect(isPromptCancel(await resultPromise)).toBe(true);
    expect(process.stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(process.stdin.listenerCount('keypress')).toBe(listenerCount);
  });

  it('cleans up and preserves a multiselect renderer failure', async () => {
    const listenerCount = process.stdin.listenerCount('keypress');
    const rendererError = new Error('renderer failed');
    vi.mocked(process.stdout.write).mockImplementation((chunk) => {
      if (String(chunk).includes('Select skills')) {
        throw rendererError;
      }
      return true;
    });

    await expect(
      multiselectPrompt({
        message: 'Select skills',
        options: [{ value: 'skill', label: 'Skill' }],
      }),
    ).rejects.toBe(rendererError);
    expect(process.stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(process.stdin.setRawMode).toHaveBeenLastCalledWith(false);
    expect(process.stdin.listenerCount('keypress')).toBe(listenerCount);
  });

  it('bounds a long multiselect list with a generic overflow marker', async () => {
    const resultPromise = multiselectPrompt({
      message: '选择技能',
      options: Array.from({ length: 10 }, (_, index) => ({
        value: index + 1,
        label: `技能 ${index + 1}`,
      })),
    });

    await new Promise((resolve) => setImmediate(resolve));
    const output = stripVTControlCharacters(
      vi
        .mocked(process.stdout.write)
        .mock.calls.map(([chunk]) => String(chunk))
        .join(''),
    );
    process.stdin.emit('keypress', '', { name: 'escape' });
    await resultPromise;

    expect(output).toContain('...');
    expect(output).not.toContain('技能 9');
    expect(output).not.toMatch(/more below|下方还有/);
  });

  it('shrinks the multiselect window to the terminal height', async () => {
    Object.defineProperty(process.stdout, 'rows', {
      value: 8,
      configurable: true,
    });
    const resultPromise = multiselectPrompt({
      message: 'Select skills',
      options: Array.from({ length: 5 }, (_, index) => ({
        value: index + 1,
        label: `Skill ${index + 1}`,
      })),
    });

    await new Promise((resolve) => setImmediate(resolve));
    const output = stripVTControlCharacters(
      vi
        .mocked(process.stdout.write)
        .mock.calls.map(([chunk]) => String(chunk))
        .join(''),
    );
    process.stdin.emit('keypress', '', { name: 'escape' });
    await resultPromise;

    expect(output).toContain('Skill 2');
    expect(output).not.toContain('Skill 3');
  });
});
