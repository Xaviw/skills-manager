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

  it('parses non-git HTTP URLs as well-known sources', () => {
    expect(parseSource('https://open.feishu.cn')).toEqual({
      type: 'well-known',
      url: 'https://open.feishu.cn',
    });
    expect(parseSource('https://docs.example.com/skills')).toEqual({
      type: 'well-known',
      url: 'https://docs.example.com/skills',
    });
  });

  it('parses hosted artifact URLs as direct downloads', () => {
    expect(
      parseSource(
        'https://raw.githubusercontent.com/owner/repo/main/skills/my-skill/SKILL.md',
      ),
    ).toEqual({
      type: 'download',
      url: 'https://raw.githubusercontent.com/owner/repo/main/skills/my-skill/SKILL.md',
    });
    expect(
      parseSource('https://github.com/owner/repo/archive/refs/heads/main.zip'),
    ).toEqual({
      type: 'download',
      url: 'https://github.com/owner/repo/archive/refs/heads/main.zip',
    });
  });

  it('keeps git-looking URLs as generic git sources', () => {
    expect(parseSource('https://git.example.com/team/repo.git')).toEqual({
      type: 'git',
      url: 'https://git.example.com/team/repo.git',
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
