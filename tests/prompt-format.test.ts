import { describe, expect, it } from 'vitest';
import { formatPromptHint } from '../src/prompt-format.js';

describe('prompt format helpers', () => {
  it('returns undefined for blank values', () => {
    expect(formatPromptHint('   \n\t  ')).toBeUndefined();
  });

  it('collapses multiline values into a single line', () => {
    expect(formatPromptHint('first line\nsecond line\nthird line', 80)).toBe('first line second line third line');
  });

  it('truncates long values and appends ellipsis', () => {
    expect(formatPromptHint('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefg...');
  });

  it('handles very small max lengths', () => {
    expect(formatPromptHint('abcdef', 3)).toBe('...');
    expect(formatPromptHint('abcdef', 2)).toBe('..');
  });
});
