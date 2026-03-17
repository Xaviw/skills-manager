import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, normalize, resolve, sep } from 'path';
import { simpleGit } from 'simple-git';
import { t } from './i18n.js';

const CLONE_TIMEOUT_MS = 60_000;

export class GitCloneError extends Error {
  readonly url: string;

  constructor(message: string, url: string) {
    super(message);
    this.name = 'GitCloneError';
    this.url = url;
  }
}

export async function cloneRepo(url: string, ref?: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'skls-mgr-'));
  const git = simpleGit({
    timeout: { block: CLONE_TIMEOUT_MS },
  });
  const cloneOptions = ref
    ? ['--depth', '1', '--branch', ref]
    : ['--depth', '1'];

  try {
    await git.clone(url, tempDir, cloneOptions);
    return tempDir;
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    throw new GitCloneError(t('failedToClone', { url, message }), url);
  }
}

export async function cleanupTempDir(dir: string): Promise<void> {
  const normalizedDir = normalize(resolve(dir));
  const normalizedTmpDir = normalize(resolve(tmpdir()));

  if (
    !normalizedDir.startsWith(normalizedTmpDir + sep) &&
    normalizedDir !== normalizedTmpDir
  ) {
    throw new Error(t('attemptedTempDirCleanupOutsideTemp'));
  }

  await rm(dir, { recursive: true, force: true });
}
