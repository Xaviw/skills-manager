import { describe, expect, it, vi } from 'vitest';
import pc from 'picocolors';
import { formatPromptHint, showPromptHelp } from '../src/prompt-format.js';

describe('prompt format helpers', () => {
  it('returns undefined for blank values', () => {
    expect(formatPromptHint('   \n\t  ')).toBeUndefined();
  });

  it('collapses multiline values into a single line', () => {
    expect(formatPromptHint('first line\nsecond line\nthird line', 80)).toBe(
      'first line second line third line',
    );
  });

  it('truncates long values and appends ellipsis', () => {
    expect(formatPromptHint('abcdefghijklmnopqrstuvwxyz', 10)).toBe(
      'abcdefg...',
    );
  });

  it('handles very small max lengths', () => {
    expect(formatPromptHint('abcdef', 3)).toBe('...');
    expect(formatPromptHint('abcdef', 2)).toBe('..');
  });

  it('logs prompt help as a dimmed standalone line', () => {
    const logMessage = vi.fn();

    showPromptHelp('↑↓ 切换 · Enter 确认 · ESC 取消', logMessage);

    expect(logMessage).toHaveBeenCalledWith(
      `${pc.dim('↑↓ 切换 · Enter 确认 · ESC 取消')}\n`,
    );
  });
});
