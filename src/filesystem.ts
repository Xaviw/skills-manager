import { cp, lstat, mkdir, readlink, readdir, rm } from 'fs/promises';
import { join, relative, resolve, dirname } from 'path';

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export async function replaceDirectoryWithCopy(
  sourceDir: string,
  targetDir: string,
): Promise<void> {
  const parentDir = dirname(targetDir);
  const targetName = targetDir.split(/[\\/]/).pop() ?? 'skill';
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempDir = join(parentDir, `${targetName}.tmp-${uniqueSuffix}`);
  const backupDir = join(parentDir, `${targetName}.bak-${uniqueSuffix}`);
  let hasBackup = false;

  await mkdir(parentDir, { recursive: true });

  try {
    await copyDirectory(sourceDir, tempDir);

    if (await pathExists(targetDir)) {
      await import('fs/promises').then((fs) => fs.rename(targetDir, backupDir));
      hasBackup = true;
    }

    await import('fs/promises').then((fs) => fs.rename(tempDir, targetDir));

    if (hasBackup) {
      await rm(backupDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    if (hasBackup) {
      if (!(await pathExists(targetDir))) {
        await import('fs/promises')
          .then((fs) => fs.rename(backupDir, targetDir))
          .catch(() => {});
      } else {
        await rm(backupDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    throw error;
  }
}

export function sanitizeName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');

  return sanitized || 'unnamed-skill';
}

export async function removeIfExists(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true }).catch(() => {});
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

const EXCLUDE_FILES = new Set(['metadata.json']);
const EXCLUDE_DIRS = new Set(['.git', '__pycache__', 'node_modules']);

export async function copyDirectory(
  sourceDir: string,
  targetDir: string,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => {
        if (entry.isDirectory()) {
          return !EXCLUDE_DIRS.has(entry.name);
        }
        return !EXCLUDE_FILES.has(entry.name) && !entry.name.startsWith('.');
      })
      .map(async (entry) => {
        const sourcePath = join(sourceDir, entry.name);
        const targetPath = join(targetDir, entry.name);
        if (entry.isDirectory()) {
          await copyDirectory(sourcePath, targetPath);
          return;
        }

        await cp(sourcePath, targetPath, {
          recursive: true,
          dereference: true,
        });
      }),
  );
}

export async function createDirectorySymlink(
  targetDir: string,
  linkPath: string,
): Promise<boolean> {
  try {
    const resolvedTarget = resolve(targetDir);

    try {
      const existing = await lstat(linkPath);
      if (existing.isSymbolicLink()) {
        const currentTarget = await readlink(linkPath);
        const absoluteTarget = resolve(dirname(linkPath), currentTarget);
        if (absoluteTarget === resolvedTarget) {
          return true;
        }
      }
      await rm(linkPath, { recursive: true, force: true });
    } catch {
      // ignore
    }

    await mkdir(dirname(linkPath), { recursive: true });
    const relativeTarget = relative(dirname(linkPath), resolvedTarget);
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
    await import('fs/promises').then((fs) =>
      fs.symlink(relativeTarget, linkPath, symlinkType),
    );
    return true;
  } catch {
    return false;
  }
}
