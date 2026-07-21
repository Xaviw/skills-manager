import { join } from 'path';
import {
  createDirectorySymlink,
  removeIfExists,
  replaceDirectoryWithCopy,
} from './filesystem.js';
import { getBaseDir } from './paths.js';

export async function installBaseSkillToProject(
  directoryName: string,
  targetRootDir: string,
  mode: 'copy' | 'link',
): Promise<{ path: string; linked: boolean }> {
  const sourceDir = join(getBaseDir(), directoryName);
  const targetDir = join(targetRootDir, directoryName);

  if (mode === 'copy') {
    await replaceDirectoryWithCopy(sourceDir, targetDir);
    return { path: targetDir, linked: false };
  }

  await removeIfExists(targetDir);

  const linked = await createDirectorySymlink(sourceDir, targetDir);
  if (!linked) {
    await replaceDirectoryWithCopy(sourceDir, targetDir);
  }

  return { path: targetDir, linked };
}
