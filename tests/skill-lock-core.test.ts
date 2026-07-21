import { existsSync, rmSync } from 'fs';
import * as fsPromises from 'fs/promises';
import { dirname, join } from 'path';
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_LOCK_VERSION } from '../src/constants.js';
import {
  addSkillToLock,
  readSkillLock,
  removeSkillFromLock,
  writeSkillLock,
} from '../src/skill-lock.js';
import { getLockFilePath } from '../src/paths.js';

vi.mock('fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    rename: vi.fn(actual.rename),
  };
});

describe('skill lock core behavior', () => {
  let homeDir: string;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;

  beforeEach(async () => {
    const actualFs =
      await vi.importActual<typeof import('fs/promises')>('fs/promises');
    vi.mocked(fsPromises.rename).mockImplementation(actualFs.rename);
    homeDir = await mkdtemp(join(tmpdir(), 'skls-mgr-home-'));
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('keeps the previous lock when atomic replacement fails', async () => {
    await writeSkillLock({
      version: CURRENT_LOCK_VERSION,
      skills: {},
      targetDirectories: ['./old'],
    });
    const previousContent = await readFile(getLockFilePath(), 'utf-8');

    vi.mocked(fsPromises.rename).mockRejectedValueOnce(
      new Error('rename failed'),
    );

    await expect(
      writeSkillLock({
        version: CURRENT_LOCK_VERSION,
        skills: {},
        targetDirectories: ['./new'],
      }),
    ).rejects.toThrow('rename failed');
    expect(await readFile(getLockFilePath(), 'utf-8')).toBe(previousContent);
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
});
