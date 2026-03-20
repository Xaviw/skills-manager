import { describe, expect, it } from 'vitest';
import {
  getOwnerRepo,
  parseSource,
  sanitizeSubpath,
} from '../src/source-parser.js';

describe('source parser', () => {
  it('rejects unsafe subpaths with directory traversal', () => {
    expect(() => sanitizeSubpath('../skills')).toThrow();
    expect(() => sanitizeSubpath('skills\\..\\secret')).toThrow();
  });

  it('rejects GitHub tree URLs whose subpath traverses outside the repository', () => {
    expect(() =>
      parseSource('https://github.com/owner/repo/tree/main/skills/../secret'),
    ).toThrow();
  });

  it('parses ambiguous GitHub tree branch URLs consistently', () => {
    expect(
      parseSource('https://github.com/owner/repo/tree/feature/my-skill'),
    ).toEqual({
      type: 'github',
      url: 'https://github.com/owner/repo.git',
      ref: 'feature',
      subpath: 'my-skill',
    });
  });

  it('parses shorthand GitHub sources with sanitized subpaths', () => {
    expect(parseSource('owner/repo/skills/my-skill')).toEqual({
      type: 'github',
      url: 'https://github.com/owner/repo.git',
      subpath: 'skills/my-skill',
    });
  });

  it('falls back to a generic git source for non-GitHub URLs', () => {
    expect(parseSource('git@internal.example.com:team/repo.git')).toEqual({
      type: 'git',
      url: 'git@internal.example.com:team/repo.git',
    });
  });

  it('extracts owner/repo from supported GitHub sources only', () => {
    expect(
      getOwnerRepo({
        type: 'github',
        url: 'git@github.com:owner/repo.git',
      }),
    ).toBe('owner/repo');
    expect(
      getOwnerRepo({
        type: 'local',
        url: '/tmp/skills',
        localPath: '/tmp/skills',
      }),
    ).toBeNull();
  });
});
