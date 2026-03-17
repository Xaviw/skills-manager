import { execSync } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import { CURRENT_LOCK_VERSION } from './constants.js';
import { getLockFilePath } from './paths.js';
import type { ManagedSkillLockEntry, ManagedSkillLockFile } from './types.js';

function createEmptyLockFile(): ManagedSkillLockFile {
  return {
    version: CURRENT_LOCK_VERSION,
    skills: {},
  };
}

export async function readSkillLock(): Promise<ManagedSkillLockFile> {
  try {
    const content = await readFile(getLockFilePath(), 'utf-8');
    const parsed = JSON.parse(content) as ManagedSkillLockFile;
    if (
      typeof parsed.version !== 'number' ||
      typeof parsed.skills !== 'object'
    ) {
      return createEmptyLockFile();
    }
    if (parsed.version < CURRENT_LOCK_VERSION) {
      return createEmptyLockFile();
    }
    return parsed;
  } catch {
    return createEmptyLockFile();
  }
}

export async function writeSkillLock(
  lock: ManagedSkillLockFile,
): Promise<void> {
  const lockPath = getLockFilePath();
  await mkdir(dirname(lockPath), { recursive: true });

  const sortedSkills: Record<string, ManagedSkillLockEntry> = {};
  for (const key of Object.keys(lock.skills).sort()) {
    sortedSkills[key] = lock.skills[key]!;
  }

  await writeFile(
    lockPath,
    JSON.stringify({ version: lock.version, skills: sortedSkills }, null, 2) +
      '\n',
    'utf-8',
  );
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

export function getGitHubToken(): string | null {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }

  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}

export async function fetchSkillFolderHash(
  ownerRepo: string,
  skillPath: string,
  token?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  let folderPath = skillPath.replace(/\\/g, '/');
  if (folderPath.endsWith('/SKILL.md')) {
    folderPath = folderPath.slice(0, -9);
  } else if (folderPath.endsWith('SKILL.md')) {
    folderPath = folderPath.slice(0, -8);
  }
  if (folderPath.endsWith('/')) {
    folderPath = folderPath.slice(0, -1);
  }

  for (const branch of ['main', 'master']) {
    try {
      const response = await fetchImpl(
        `https://api.github.com/repos/${ownerRepo}/git/trees/${branch}?recursive=1`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'skls-mgr',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );

      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as {
        sha: string;
        tree: Array<{ path: string; type: string; sha: string }>;
      };

      if (!folderPath) {
        return data.sha;
      }

      const entry = data.tree.find(
        (item) => item.type === 'tree' && item.path === folderPath,
      );
      if (entry) {
        return entry.sha;
      }
    } catch {
      continue;
    }
  }

  return null;
}
