import { describe, expect, it } from 'vitest';
import { parseAddOptions } from '../src/add.js';

describe('add command helpers', () => {
  it('parses repeated --skill flags', () => {
    const result = parseAddOptions(['repo', '--skill', 'skill-one', '--skill', 'skill-two']);

    expect(result).toEqual({
      source: 'repo',
      options: { skill: ['skill-one', 'skill-two'] },
    });
  });

  it('parses multiple skill names after a single --skill flag', () => {
    const result = parseAddOptions(['repo', '--skill', 'skill-one', 'skill-two']);

    expect(result).toEqual({
      source: 'repo',
      options: { skill: ['skill-one', 'skill-two'] },
    });
  });
});
