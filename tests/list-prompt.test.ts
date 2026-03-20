import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  fitOptionText,
  formatOverflowSummary,
  isListPromptCancel,
  listPromptCancelSymbol,
  measureDisplayWidth,
  multiselectListPrompt,
  selectListPrompt,
  summarizeSelectedLabels,
  truncateDisplayText,
} from '../src/list-prompt.js';

describe('list prompt helpers', () => {
  it('treats non-ascii characters conservatively when measuring width', () => {
    expect(measureDisplayWidth('abc')).toBe(3);
    expect(measureDisplayWidth('选择')).toBe(4);
    expect(measureDisplayWidth('a选b')).toBe(4);
    expect(measureDisplayWidth('│ ❯ ')).toBe(4);
    expect(measureDisplayWidth('🙂')).toBe(2);
  });

  it('truncates text to the requested visible width', () => {
    expect(truncateDisplayText('abcdefghijklmnopqrstuvwxyz', 10)).toBe(
      'abcdefg...',
    );
    expect(truncateDisplayText('选择要安装的技能', 8)).toBe('选择...');
  });

  it('keeps the label and truncates the hint separately when space is limited', () => {
    expect(
      fitOptionText(
        'agent-browser',
        'Browser automation for websites and forms',
        32,
      ),
    ).toEqual({
      label: 'agent-browser',
      hint: 'Browser autom...',
    });
    expect(fitOptionText('very-long-skill-name', 'short hint', 12)).toEqual({
      label: 'very-long...',
    });
  });

  it('localizes overflow summaries', () => {
    expect(formatOverflowSummary(2, 5, 'en')).toBe(
      '↑ 2 more above · ↓ 5 more below',
    );
    expect(formatOverflowSummary(1, 3, 'zh')).toBe(
      '↑ 上方还有 1 项 · ↓ 下方还有 3 项',
    );
  });

  it('summarizes selected labels with localized overflow text', () => {
    expect(summarizeSelectedLabels([], 'zh')).toBe('（无）');
    expect(summarizeSelectedLabels(['a', 'b', 'c', 'd'], 'en')).toBe(
      'a, b, c +1 more',
    );
  });

  it('detects the custom cancel symbol', () => {
    expect(isListPromptCancel(listPromptCancelSymbol)).toBe(true);
    expect(isListPromptCancel(Symbol('other'))).toBe(false);
  });
});

describe('list prompt lifecycle', () => {
  let originalIsTTY: PropertyDescriptor | undefined;
  let originalColumns: PropertyDescriptor | undefined;
  let originalSetRawMode: typeof process.stdin.setRawMode | undefined;

  beforeEach(() => {
    originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    originalColumns = Object.getOwnPropertyDescriptor(
      process.stdout,
      'columns',
    );
    originalSetRawMode = process.stdin.setRawMode;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'columns', {
      value: 80,
      configurable: true,
    });
    process.stdin.setRawMode = vi.fn();

    vi.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.stdin.removeAllListeners('keypress');
    vi.restoreAllMocks();

    if (originalIsTTY) {
      Object.defineProperty(process.stdin, 'isTTY', originalIsTTY);
    }
    if (originalColumns) {
      Object.defineProperty(process.stdout, 'columns', originalColumns);
    }
    if (originalSetRawMode) {
      process.stdin.setRawMode = originalSetRawMode;
    } else {
      process.stdin.setRawMode = undefined as never;
    }
  });

  it('pauses stdin after canceling a multiselect prompt', async () => {
    const resultPromise = multiselectListPrompt({
      message: 'Select skills',
      options: [{ value: 'skill-one', label: 'skill-one' }],
      required: true,
    });

    await Promise.resolve();
    process.stdin.emit('keypress', '', { name: 'escape' });

    expect(await resultPromise).toBe(listPromptCancelSymbol);
    expect(process.stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(process.stdin.setRawMode).toHaveBeenCalledWith(false);
    expect(process.stdin.pause).toHaveBeenCalled();
  });

  it('pauses stdin after submitting a multiselect prompt', async () => {
    const resultPromise = multiselectListPrompt({
      message: 'Select skills',
      options: [{ value: 'skill-one', label: 'skill-one' }],
      initialValues: ['skill-one'],
      required: true,
    });

    await Promise.resolve();
    process.stdin.emit('keypress', '', { name: 'return' });

    expect(await resultPromise).toEqual(['skill-one']);
    expect(process.stdin.pause).toHaveBeenCalled();
  });

  it('submits the focused option in a single-select prompt', async () => {
    const resultPromise = selectListPrompt({
      message: 'Installation mode',
      options: [
        { value: 'link', label: 'link' },
        { value: 'copy', label: 'copy' },
      ],
    });

    await Promise.resolve();
    process.stdin.emit('keypress', '', { name: 'down' });
    process.stdin.emit('keypress', '', { name: 'return' });

    expect(await resultPromise).toBe('copy');
    expect(process.stdin.pause).toHaveBeenCalled();
  });

  it('respects the initial single-select value when navigating back upward', async () => {
    const resultPromise = selectListPrompt({
      message: 'Installation mode',
      options: [
        { value: 'link', label: 'link' },
        { value: 'copy', label: 'copy' },
      ],
      initialValue: 'copy',
    });

    await Promise.resolve();
    process.stdin.emit('keypress', '', { name: 'up' });
    process.stdin.emit('keypress', '', { name: 'return' });

    expect(await resultPromise).toBe('link');
  });
});
