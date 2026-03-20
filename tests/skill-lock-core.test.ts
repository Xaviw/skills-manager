import { existsSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_LOCK_VERSION } from '../src/constants.js';
import {
  addSkillToLock,
  fetchSkillFolderHash,
  getGitHubToken,
  readSkillLock,
  removeSkillFromLock,
  writeSkillLock,
} from '../src/skill-lock.js';
import { getLockFilePath } from '../src/paths.js';

describe('skill lock core behavior', () => {
  let homeDir: string;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;
  let previousGithubToken: string | undefined;
  let previousGhToken: string | undefined;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'skls-mgr-home-'));
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;
    previousGithubToken = process.env.GITHUB_TOKEN;
    previousGhToken = process.env.GH_TOKEN;

    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }

    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }

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

    if (homeDir && existsSync(homeDir)) {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('returns an empty lock for corrupted JSON and old versions', async () => {
    const lockPath = getLockFilePath();
    await mkdir(dirname(lockPath), { recursive: true });
    await writeFile(lockPath, '{not-json', 'utf-8');
    expect(await readSkillLock()).toEqual({
      version: CURRENT_LOCK_VERSION,
      skills: {},
      targetDirectories: [],
    });

    await writeFile(
      lockPath,
      JSON.stringify({
        version: CURRENT_LOCK_VERSION - 1,
        skills: { stale: {} },
        targetDirectories: ['./skills'],
      }),
      'utf-8',
    );
    expect(await readSkillLock()).toEqual({
      version: CURRENT_LOCK_VERSION,
      skills: {},
      targetDirectories: [],
    });
  });

  it('writes sorted lock files with a trailing newline', async () => {
    await writeSkillLock({
      version: CURRENT_LOCK_VERSION,
      skills: {
        zebra: {
          displayName: 'zebra',
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo.git',
          skillPath: 'skills/zebra/SKILL.md',
          skillFolderHash: 'hash-z',
          installedAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        alpha: {
          displayName: 'alpha',
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo.git',
          skillPath: 'skills/alpha/SKILL.md',
          skillFolderHash: 'hash-a',
          installedAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      },
      targetDirectories: ['  ./skills ', './skills', '/tmp/project'],
    });

    const raw = await readFile(getLockFilePath(), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.indexOf('"alpha"')).toBeLessThan(raw.indexOf('"zebra"'));
    expect(raw).toContain(
      '"targetDirectories": [\n    "./skills",\n    "/tmp/project"\n  ]',
    );
  });

  it('preserves installedAt when updating a lock entry and removes tracked skills', async () => {
    await addSkillToLock('skill-one', {
      displayName: 'skill-one',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo.git',
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'hash-one',
    });

    const firstLock = await readSkillLock();
    const initialInstalledAt = firstLock.skills['skill-one']?.installedAt;
    const initialUpdatedAt = firstLock.skills['skill-one']?.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await addSkillToLock('skill-one', {
      displayName: 'skill-one',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo.git',
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'hash-two',
    });

    const secondLock = await readSkillLock();
    expect(secondLock.skills['skill-one']?.installedAt).toBe(
      initialInstalledAt,
    );
    expect(secondLock.skills['skill-one']?.updatedAt).not.toBe(
      initialUpdatedAt,
    );
    expect(secondLock.skills['skill-one']?.skillFolderHash).toBe('hash-two');
    expect(await removeSkillFromLock('missing-skill')).toBe(false);
    expect(await removeSkillFromLock('skill-one')).toBe(true);
    expect((await readSkillLock()).skills['skill-one']).toBeUndefined();
  });

  it('prefers explicit GitHub tokens from the environment', () => {
    process.env.GH_TOKEN = 'gh-token';
    process.env.GITHUB_TOKEN = 'github-token';
    expect(getGitHubToken()).toBe('github-token');

    delete process.env.GITHUB_TOKEN;
    expect(getGitHubToken()).toBe('gh-token');
  });

  it('returns the repository SHA for root-level skills', async () => {
    const fetchMock = async () =>
      ({
        ok: true,
        json: async () => ({
          sha: 'repo-sha',
          tree: [],
        }),
      }) as Response;

    await expect(
      fetchSkillFolderHash(
        'owner/repo',
        'SKILL.md',
        null,
        fetchMock as typeof fetch,
      ),
    ).resolves.toBe('repo-sha');
  });

  it('falls back from main to master when resolving folder hashes', async () => {
    const fetchCalls: string[] = [];
    const fetchMock = async (url: string) => {
      fetchCalls.push(url);
      if (url.includes('/main?')) {
        return {
          ok: false,
          json: async () => ({}),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          sha: 'repo-sha',
          tree: [{ path: 'skills/skill-one', type: 'tree', sha: 'folder-sha' }],
        }),
      } as Response;
    };

    await expect(
      fetchSkillFolderHash(
        'owner/repo',
        'skills\\skill-one\\SKILL.md',
        'token',
        fetchMock as typeof fetch,
      ),
    ).resolves.toBe('folder-sha');

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]).toContain('/main?recursive=1');
    expect(fetchCalls[1]).toContain('/master?recursive=1');
  });
});
