import { readdir } from 'fs/promises';
import { join } from 'path';
import { ensureBaseDir, getBaseDir } from './paths.js';
import {
  createDirectorySymlink,
  removeIfExists,
  sanitizeName,
} from './filesystem.js';
import {
  addSkillToLock,
  readSkillLock,
  removeSkillFromLock,
} from './skill-lock.js';
import type { BaseSkillInfo, ManagedSkillLockEntry } from './types.js';

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

export async function hasBaseSkillDirectory(
  directoryName: string,
): Promise<boolean> {
  const skills = await listBaseSkills();
  return skills.some(
    (skill) => skill.directoryName === sanitizeName(directoryName),
  );
}

export async function installSkillToBaseDir(
  sourceDir: string,
  directoryName: string,
  lockEntry?: Omit<ManagedSkillLockEntry, 'installedAt' | 'updatedAt'>,
): Promise<string> {
  const baseDir = await ensureBaseDir();
  const sanitizedDirectoryName = sanitizeName(directoryName);
  const targetDir = join(baseDir, sanitizedDirectoryName);
  const { replaceDirectoryWithCopy } = await import('./filesystem.js');

  await replaceDirectoryWithCopy(sourceDir, targetDir);

  if (lockEntry) {
    await addSkillToLock(sanitizedDirectoryName, lockEntry);
  }

  return targetDir;
}

export async function installBaseSkillToProject(
  directoryName: string,
  targetRootDir: string,
  mode: 'copy' | 'link',
): Promise<{ path: string; linked: boolean }> {
  const sourceDir = join(getBaseDir(), directoryName);
  const targetDir = join(targetRootDir, directoryName);

  if (mode === 'copy') {
    const { replaceDirectoryWithCopy } = await import('./filesystem.js');
    await replaceDirectoryWithCopy(sourceDir, targetDir);
    return { path: targetDir, linked: false };
  }

  await removeIfExists(targetDir);

  const linked = await createDirectorySymlink(sourceDir, targetDir);
  if (!linked) {
    const { replaceDirectoryWithCopy } = await import('./filesystem.js');
    await replaceDirectoryWithCopy(sourceDir, targetDir);
  }

  return { path: targetDir, linked };
}

export async function removeBaseSkill(directoryName: string): Promise<void> {
  const skillPath = join(getBaseDir(), directoryName);
  await removeIfExists(skillPath);
  await removeSkillFromLock(directoryName);
}
