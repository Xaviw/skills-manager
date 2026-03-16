import { homedir } from 'os';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { LOCK_FILE_NAME } from './constants.js';

export function getBaseDir(): string {
  return join(homedir(), '.config', 'skls-mgr');
}

export function getLockFilePath(): string {
  return join(getBaseDir(), LOCK_FILE_NAME);
}

export async function ensureBaseDir(): Promise<string> {
  const baseDir = getBaseDir();
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}
