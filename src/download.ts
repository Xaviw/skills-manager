import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import matter from 'gray-matter';
import { sanitizeName } from './filesystem.js';
import type { RemoteSourceResult } from './types.js';

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;

export async function downloadSkillMd(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteSourceResult | null> {
  const tempDir = await mkdtemp(join(tmpdir(), 'skls-mgr-download-'));
  const rootDir = await tryDownloadSkillMd(url, tempDir, fetchImpl);

  if (!rootDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return null;
  }

  return { rootDir, tempDir };
}

async function tryDownloadSkillMd(
  url: string,
  tempDir: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!response.ok) {
      return null;
    }

    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of response.body ?? []) {
      bytes += chunk.byteLength;
      if (bytes > MAX_DOWNLOAD_BYTES) {
        return null;
      }
      chunks.push(chunk);
    }

    const content = Buffer.concat(chunks).toString('utf-8');
    const { data } = matter(content);
    if (typeof data.name !== 'string' || typeof data.description !== 'string') {
      return null;
    }

    // Sanitize before using as a directory name: the frontmatter is
    // attacker-controlled and must not escape the temp tree (path traversal).
    const dirName = sanitizeName(data.name);
    const skillDir = join(tempDir, 'skills', dirName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), content, 'utf-8');
    return tempDir;
  } catch {
    return null;
  }
}
