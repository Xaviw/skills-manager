import { existsSync, rmSync } from 'fs';
import * as fsPromises from 'fs/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installManagedSkill,
  listBaseSkills,
  removeBaseSkill,
} from '../src/base-dir.js';

vi.mock('fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    cp: vi.fn(actual.cp),
    rename: vi.fn(actual.rename),
  };
});

describe('Base Skill module', () => {
  let homeDir: string;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;

  beforeEach(async () => {
    const actualFs =
      await vi.importActual<typeof import('fs/promises')>('fs/promises');
    vi.mocked(fsPromises.cp).mockImplementation(actualFs.cp);
    vi.mocked(fsPromises.rename).mockImplementation(actualFs.rename);
    homeDir = await mkdtemp(join(tmpdir(), 'skls-mgr-base-skill-'));
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

  it('installs a Managed Skill with its content and tracking metadata', async () => {
    const sourceDir = join(homeDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'SKILL.md'), '# managed', 'utf-8');

    await installManagedSkill(sourceDir, 'Skill One', {
      displayName: 'Skill One',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo.git',
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'hash-one',
    });

    const skills = await listBaseSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      directoryName: 'skill-one',
      managed: true,
      lockEntry: {
        displayName: 'Skill One',
        skillFolderHash: 'hash-one',
      },
    });
    expect(await readFile(join(skills[0]!.path, 'SKILL.md'), 'utf-8')).toBe(
      '# managed',
    );
  });

  it('keeps the previous Managed Skill when tracking commit fails', async () => {
    const oldSourceDir = join(homeDir, 'old-source');
    const newSourceDir = join(homeDir, 'new-source');
    await mkdir(oldSourceDir, { recursive: true });
    await mkdir(newSourceDir, { recursive: true });
    await writeFile(join(oldSourceDir, 'SKILL.md'), '# old', 'utf-8');
    await writeFile(join(newSourceDir, 'SKILL.md'), '# new', 'utf-8');

    await installManagedSkill(oldSourceDir, 'skill-one', {
      displayName: 'Skill One',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo.git',
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'old-hash',
    });

    const actualFs =
      await vi.importActual<typeof import('fs/promises')>('fs/promises');
    vi.mocked(fsPromises.rename).mockImplementation(async (...args) => {
      if (String(args[1]).endsWith('.skls-mgr-lock.json')) {
        throw new Error('lock write failed');
      }
      return await actualFs.rename(...args);
    });

    await expect(
      installManagedSkill(newSourceDir, 'skill-one', {
        displayName: 'Skill One',
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo.git',
        skillPath: 'skills/skill-one/SKILL.md',
        skillFolderHash: 'new-hash',
      }),
    ).rejects.toThrow('lock write failed');

    const [skill] = await listBaseSkills();
    expect(skill?.lockEntry?.skillFolderHash).toBe('old-hash');
    expect(await readFile(join(skill!.path, 'SKILL.md'), 'utf-8')).toBe(
      '# old',
    );
  });

  it('removes partial prepare data when copying fails', async () => {
    const oldSourceDir = join(homeDir, 'old-source');
    const newSourceDir = join(homeDir, 'new-source');
    await mkdir(oldSourceDir, { recursive: true });
    await mkdir(newSourceDir, { recursive: true });
    await writeFile(join(oldSourceDir, 'SKILL.md'), '# old', 'utf-8');
    await writeFile(join(newSourceDir, 'SKILL.md'), '# new', 'utf-8');
    await installManagedSkill(oldSourceDir, 'skill-one', {
      displayName: 'Skill One',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo.git',
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'old-hash',
    });

    vi.mocked(fsPromises.cp).mockRejectedValueOnce(new Error('copy failed'));
    await expect(
      installManagedSkill(newSourceDir, 'skill-one', {
        displayName: 'Skill One',
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo.git',
        skillPath: 'skills/skill-one/SKILL.md',
        skillFolderHash: 'new-hash',
      }),
    ).rejects.toThrow('copy failed');

    const skills = await listBaseSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      directoryName: 'skill-one',
      managed: true,
    });
  });

  it('restores a Managed Skill when removal tracking commit fails', async () => {
    const sourceDir = join(homeDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'SKILL.md'), '# keep', 'utf-8');
    await installManagedSkill(sourceDir, 'skill-one', {
      displayName: 'Skill One',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo.git',
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'hash-one',
    });

    const actualFs =
      await vi.importActual<typeof import('fs/promises')>('fs/promises');
    vi.mocked(fsPromises.rename).mockImplementation(async (...args) => {
      if (String(args[1]).endsWith('.skls-mgr-lock.json')) {
        throw new Error('lock write failed');
      }
      return await actualFs.rename(...args);
    });

    await expect(removeBaseSkill('skill-one')).rejects.toThrow(
      'lock write failed',
    );

    const [skill] = await listBaseSkills();
    expect(skill?.lockEntry?.skillFolderHash).toBe('hash-one');
    expect(await readFile(join(skill!.path, 'SKILL.md'), 'utf-8')).toBe(
      '# keep',
    );
  });

  it('keeps all tracking metadata when Managed Skills install concurrently', async () => {
    const sourceOne = join(homeDir, 'source-one');
    const sourceTwo = join(homeDir, 'source-two');
    await mkdir(sourceOne, { recursive: true });
    await mkdir(sourceTwo, { recursive: true });
    await writeFile(join(sourceOne, 'SKILL.md'), '# one', 'utf-8');
    await writeFile(join(sourceTwo, 'SKILL.md'), '# two', 'utf-8');

    const actualFs =
      await vi.importActual<typeof import('fs/promises')>('fs/promises');
    let lockRenameCount = 0;
    let releaseFirstRename: (() => void) | undefined;
    const secondRenameReached = new Promise<void>((resolve) => {
      releaseFirstRename = resolve;
    });
    vi.mocked(fsPromises.rename).mockImplementation(async (...args) => {
      if (String(args[1]).endsWith('.skls-mgr-lock.json')) {
        lockRenameCount += 1;
        if (lockRenameCount === 1) {
          await Promise.race([
            secondRenameReached,
            new Promise((resolve) => setTimeout(resolve, 20)),
          ]);
        } else {
          releaseFirstRename?.();
        }
      }
      return await actualFs.rename(...args);
    });

    await Promise.all([
      installManagedSkill(sourceOne, 'skill-one', {
        displayName: 'Skill One',
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo.git',
        skillPath: 'skills/skill-one/SKILL.md',
        skillFolderHash: 'hash-one',
      }),
      installManagedSkill(sourceTwo, 'skill-two', {
        displayName: 'Skill Two',
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo.git',
        skillPath: 'skills/skill-two/SKILL.md',
        skillFolderHash: 'hash-two',
      }),
    ]);

    expect(
      (await listBaseSkills()).map((skill) => ({
        directoryName: skill.directoryName,
        managed: skill.managed,
        hash: skill.lockEntry?.skillFolderHash,
      })),
    ).toEqual([
      { directoryName: 'skill-one', managed: true, hash: 'hash-one' },
      { directoryName: 'skill-two', managed: true, hash: 'hash-two' },
    ]);
  });

  it('uses directories as authority and retains ignored stale metadata', async () => {
    const sourceDir = join(homeDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'SKILL.md'), '# skill', 'utf-8');
    await installManagedSkill(sourceDir, 'stale-skill', {
      displayName: 'Stale Skill',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo.git',
      skillPath: 'skills/stale-skill/SKILL.md',
      skillFolderHash: 'old-hash',
    });

    const [installed] = await listBaseSkills();
    const installedAt = installed!.lockEntry!.installedAt;
    const baseDir = join(installed!.path, '..');
    await rm(installed!.path, { recursive: true });
    await mkdir(join(baseDir, 'unmanaged-skill'));

    expect(await listBaseSkills()).toMatchObject([
      { directoryName: 'unmanaged-skill', managed: false },
    ]);

    await installManagedSkill(sourceDir, 'stale-skill', {
      displayName: 'Stale Skill',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo.git',
      skillPath: 'skills/stale-skill/SKILL.md',
      skillFolderHash: 'new-hash',
    });
    const restored = (await listBaseSkills()).find(
      (skill) => skill.directoryName === 'stale-skill',
    );
    expect(restored?.lockEntry?.installedAt).toBe(installedAt);
  });
});
