import { readFile, rename, rm, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import { CURRENT_LOCK_VERSION } from './constants.js';
import { getLockFilePath } from './paths.js';
import type { ManagedSkillLockEntry, ManagedSkillLockFile } from './types.js';

function createEmptyLockFile(): ManagedSkillLockFile {
  return {
    version: CURRENT_LOCK_VERSION,
    skills: {},
    targetDirectories: [],
  };
}

function normalizeTargetDirectories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const directories: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    directories.push(normalized);
  }

  return directories;
}

export async function readSkillLock(): Promise<ManagedSkillLockFile> {
  try {
    const content = await readFile(getLockFilePath(), 'utf-8');
    const parsed = JSON.parse(content) as Partial<ManagedSkillLockFile>;
    if (
      typeof parsed.version !== 'number' ||
      typeof parsed.skills !== 'object' ||
      parsed.skills === null
    ) {
      return createEmptyLockFile();
    }
    if (parsed.version < CURRENT_LOCK_VERSION) {
      return createEmptyLockFile();
    }

    return {
      version: parsed.version,
      skills: parsed.skills as Record<string, ManagedSkillLockEntry>,
      targetDirectories: normalizeTargetDirectories(parsed.targetDirectories),
    };
  } catch {
    return createEmptyLockFile();
  }
}

export async function writeSkillLock(
  lock: ManagedSkillLockFile,
): Promise<void> {
  const lockPath = getLockFilePath();
  const tempPath = `${lockPath}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  await mkdir(dirname(lockPath), { recursive: true });

  const sortedSkills: Record<string, ManagedSkillLockEntry> = {};
  for (const key of Object.keys(lock.skills).sort()) {
    sortedSkills[key] = lock.skills[key]!;
  }

  try {
    await writeFile(
      tempPath,
      JSON.stringify(
        {
          version: lock.version,
          skills: sortedSkills,
          targetDirectories: normalizeTargetDirectories(lock.targetDirectories),
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    await rename(tempPath, lockPath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

export async function addSkillToLock(
  directoryName: string,
  entry: Omit<ManagedSkillLockEntry, 'installedAt' | 'updatedAt'>,
): Promise<void> {
  const lock = await readSkillLock();
  const existing = lock.skills[directoryName];
  const now = new Date().toISOString();
  lock.skills[directoryName] = {
    ...entry,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
  };
  await writeSkillLock(lock);
}

export async function removeSkillFromLock(
  directoryName: string,
): Promise<boolean> {
  const lock = await readSkillLock();
  if (!(directoryName in lock.skills)) {
    return false;
  }
  delete lock.skills[directoryName];
  await writeSkillLock(lock);
  return true;
}

export async function readSavedTargetDirectories(): Promise<string[]> {
  const lock = await readSkillLock();
  return lock.targetDirectories;
}

export async function addSavedTargetDirectory(
  targetDir: string,
): Promise<void> {
  const normalizedTargetDir = targetDir.trim();
  if (!normalizedTargetDir) {
    return;
  }

  const lock = await readSkillLock();
  lock.targetDirectories = [
    ...lock.targetDirectories.filter((entry) => entry !== normalizedTargetDir),
    normalizedTargetDir,
  ];
  await writeSkillLock(lock);
}
