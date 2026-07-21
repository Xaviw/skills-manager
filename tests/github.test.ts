import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchSkillFolderHashes, getGitHubToken } from '../src/github.js';

describe('GitHub adapter', () => {
  let previousGithubToken: string | undefined;
  let previousGhToken: string | undefined;

  beforeEach(() => {
    previousGithubToken = process.env.GITHUB_TOKEN;
    previousGhToken = process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  afterEach(() => {
    if (previousGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousGithubToken;
    }

    if (previousGhToken === undefined) {
      delete process.env.GH_TOKEN;
    } else {
      process.env.GH_TOKEN = previousGhToken;
    }
  });

  it('prefers explicit GitHub tokens from the environment', () => {
    process.env.GH_TOKEN = 'gh-token';
    process.env.GITHUB_TOKEN = 'github-token';
    expect(getGitHubToken()).toBe('github-token');

    delete process.env.GITHUB_TOKEN;
    expect(getGitHubToken()).toBe('gh-token');
  });

  it('fetches multiple folder hashes from one explicit ref tree', async () => {
    const fetchCalls: string[] = [];
    const fetchMock = async (url: string) => {
      fetchCalls.push(url);
      return {
        ok: true,
        json: async () => ({
          sha: 'repo-sha',
          tree: [{ path: 'skills/skill-one', type: 'tree', sha: 'folder-sha' }],
        }),
      } as Response;
    };

    await expect(
      fetchSkillFolderHashes(
        'owner/repo',
        ['SKILL.md', 'skills\\skill-one\\SKILL.md'],
        'token',
        'feature/release',
        fetchMock as typeof fetch,
      ),
    ).resolves.toEqual({
      'SKILL.md': 'repo-sha',
      'skills\\skill-one\\SKILL.md': 'folder-sha',
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toContain('/feature%2Frelease?recursive=1');
  });

  it('resolves the repository default branch when no ref is supplied', async () => {
    const fetchCalls: string[] = [];
    const fetchMock = async (url: string) => {
      fetchCalls.push(url);
      if (url === 'https://api.github.com/repos/owner/repo') {
        return {
          ok: true,
          json: async () => ({ default_branch: 'trunk' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ sha: 'repo-sha', tree: [] }),
      } as Response;
    };

    await expect(
      fetchSkillFolderHashes(
        'owner/repo',
        ['SKILL.md'],
        null,
        undefined,
        fetchMock as typeof fetch,
      ),
    ).resolves.toEqual({ 'SKILL.md': 'repo-sha' });

    expect(fetchCalls).toEqual([
      'https://api.github.com/repos/owner/repo',
      'https://api.github.com/repos/owner/repo/git/trees/trunk?recursive=1',
    ]);
  });
});
