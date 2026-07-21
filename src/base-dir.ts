import { existsSync } from 'fs';
import { readdir, rename, rm } from 'fs/promises';
import { join } from 'path';
import { ensureBaseDir, getBaseDir } from './paths.js';
import { copyDirectory, sanitizeName } from './filesystem.js';
import {
  addSkillToLock,
  readSkillLock,
  removeSkillFromLock,
} from './skill-lock.js';
import type { BaseSkillInfo, ManagedSkillTracking } from './types.js';

// ponytail: 单个 CLI 只使用一个 lock；出现多 home 并发需求时再按 lock 路径拆分队列。
let commitQueue: Promise<void> = Promise.resolve();

async function serializeCommit<T>(commit: () => Promise<T>): Promise<T> {
  const result = commitQueue.then(commit, commit);
  commitQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return await result;
}

export async function listBaseSkills(): Promise<BaseSkillInfo[]> {
  const baseDir = await ensureBaseDir();
  const lock = await readSkillLock();

  try {
    const entries = await readdir(baseDir, {
      encoding: 'utf8',
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        directoryName: entry.name,
        managed: Boolean(lock.skills[entry.name]),
        lockEntry: lock.skills[entry.name],
        path: join(baseDir, entry.name),
      }))
      .sort((a, b) => a.directoryName.localeCompare(b.directoryName));
  } catch {
    return [];
  }
}

export async function installManagedSkill(
  sourceDir: string,
  directoryName: string,
  tracking: ManagedSkillTracking,
): Promise<void> {
  const baseDir = await ensureBaseDir();
  const sanitizedDirectoryName = sanitizeName(directoryName);
  const targetDir = join(baseDir, sanitizedDirectoryName);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempDir = join(baseDir, `${sanitizedDirectoryName}.tmp-${suffix}`);
  const backupDir = join(baseDir, `${sanitizedDirectoryName}.bak-${suffix}`);
  let hasBackup = false;
  let hasReplacement = false;

  try {
    await copyDirectory(sourceDir, tempDir);
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  await serializeCommit(async () => {
    try {
      if (existsSync(targetDir)) {
        await rename(targetDir, backupDir);
        hasBackup = true;
      }

      await rename(tempDir, targetDir);
      hasReplacement = true;
      await addSkillToLock(sanitizedDirectoryName, tracking);

      if (hasBackup) {
        await rm(backupDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});

      try {
        if (hasReplacement) {
          await rm(targetDir, { recursive: true, force: true });
        }
        if (hasBackup) {
          await rename(backupDir, targetDir);
        }
      } catch (rollbackError) {
        const recoveryPath = hasBackup ? backupDir : targetDir;
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; rollback failed, recovery path: ${recoveryPath}`,
          { cause: rollbackError },
        );
      }

      throw error;
    }
  });
}

export async function removeBaseSkill(directoryName: string): Promise<void> {
  await serializeCommit(async () => {
    const skillPath = join(getBaseDir(), directoryName);
    if (!existsSync(skillPath)) {
      return;
    }

    const backupPath = `${skillPath}.bak-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    await rename(skillPath, backupPath);

    try {
      await removeSkillFromLock(directoryName);
    } catch (error) {
      try {
        await rename(backupPath, skillPath);
      } catch (rollbackError) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; rollback failed, recovery path: ${backupPath}`,
          { cause: rollbackError },
        );
      }
      throw error;
    }

    await rm(backupPath, { recursive: true, force: true }).catch(() => {});
  });
}
