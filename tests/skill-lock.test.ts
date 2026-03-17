import { existsSync, rmSync } from 'fs';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_LOCK_VERSION } from '../src/constants.js';
import {
  addSavedTargetDirectory,
  readSavedTargetDirectories,
  readSkillLock,
} from '../src/skill-lock.js';
import { getLockFilePath } from '../src/paths.js';

describe('skill lock target directory history', () => {
  let homeDir: string;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'skls-mgr-home-'));
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
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

    if (homeDir && existsSync(homeDir)) {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('returns an empty target directory history for old lock files', async () => {
    const lockPath = getLockFilePath();
    await mkdir(dirname(lockPath), { recursive: true });
    await writeFile(
      lockPath,
      JSON.stringify(
        {
          version: CURRENT_LOCK_VERSION,
          skills: {},
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );

    const lock = await readSkillLock();

    expect(lock.targetDirectories).toEqual([]);
  });

  it('stores saved target directories as trimmed unique values', async () => {
    await addSavedTargetDirectory('  ./custom/skills  ');
    await addSavedTargetDirectory('./custom/skills');
    await addSavedTargetDirectory('/tmp/shared-skills');

    expect(await readSavedTargetDirectories()).toEqual([
      './custom/skills',
      '/tmp/shared-skills',
    ]);

    const lock = await readSkillLock();
    expect(lock.targetDirectories).toEqual([
      './custom/skills',
      '/tmp/shared-skills',
    ]);
  });
});
