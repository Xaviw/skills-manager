import { createHash } from 'crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { RemoteSourceResult } from './types.js';

const WELL_KNOWN_PATHS = [
  '.well-known/agent-skills',
  '.well-known/skills',
] as const;
const INDEX_FILE = 'index.json';
const DISCOVERY_SCHEMA_V2 =
  'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const DISCOVERY_TIMEOUT_MS = 10_000;
const FETCH_TIMEOUT_MS = 30_000;

type NormalizedEntry =
  | {
      version: '0.1.0';
      name: string;
      description: string;
      files: string[];
    }
  | {
      version: '0.2.0';
      name: string;
      description: string;
      type: 'skill-md' | 'archive';
      artifactUrl: string;
      digest: string;
    };

interface IndexCandidate {
  indexUrl: string;
  skillBaseUrl: string;
}

function buildIndexCandidates(url: string): IndexCandidate[] {
  const parsed = new URL(url);
  const basePath = parsed.pathname.replace(/\/$/, '');
  const candidates: IndexCandidate[] = [];

  for (const wellKnownPath of WELL_KNOWN_PATHS) {
    candidates.push({
      indexUrl: `${parsed.protocol}//${parsed.host}${basePath}/${wellKnownPath}/${INDEX_FILE}`,
      skillBaseUrl: `${parsed.protocol}//${parsed.host}${basePath}/${wellKnownPath}`,
    });

    if (basePath) {
      candidates.push({
        indexUrl: `${parsed.protocol}//${parsed.host}/${wellKnownPath}/${INDEX_FILE}`,
        skillBaseUrl: `${parsed.protocol}//${parsed.host}/${wellKnownPath}`,
      });
    }
  }

  return candidates;
}

function isValidSkillName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.length < 1 || name.length > 64) return false;
  if (!/^[a-z0-9-]+$/.test(name)) return false;
  if (name.startsWith('-') || name.endsWith('-')) return false;
  if (name.includes('--')) return false;
  return true;
}

function isSafeFilePath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:\//.test(filePath)) return false;
  if (filePath.includes('\0') || filePath.includes('..')) return false;
  return true;
}

function normalizeIndex(raw: unknown): NormalizedEntry[] | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.skills)) return null;

  if (record.$schema === DISCOVERY_SCHEMA_V2) {
    const entries: NormalizedEntry[] = [];
    for (const rawEntry of record.skills) {
      const entry = rawEntry as Record<string, unknown>;
      if (
        !isValidSkillName(entry.name) ||
        typeof entry.description !== 'string' ||
        !entry.description ||
        (entry.type !== 'skill-md' && entry.type !== 'archive') ||
        typeof entry.url !== 'string' ||
        typeof entry.digest !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(entry.digest)
      ) {
        continue;
      }
      entries.push({
        version: '0.2.0',
        name: entry.name,
        description: entry.description,
        type: entry.type,
        artifactUrl: entry.url,
        digest: entry.digest,
      });
    }
    return entries.length > 0 ? entries : null;
  }

  if (record.$schema !== undefined) return null;

  const entries: NormalizedEntry[] = [];
  for (const rawEntry of record.skills) {
    const entry = rawEntry as Record<string, unknown>;
    if (
      !isValidSkillName(entry.name) ||
      typeof entry.description !== 'string' ||
      !entry.description ||
      !Array.isArray(entry.files) ||
      entry.files.length === 0
    ) {
      return null;
    }
    for (const file of entry.files) {
      if (!isSafeFilePath(file)) {
        return null;
      }
    }
    if (
      !entry.files.some(
        (f) => typeof f === 'string' && f.toLowerCase() === 'skill.md',
      )
    ) {
      return null;
    }
    entries.push({
      version: '0.1.0',
      name: entry.name,
      description: entry.description,
      files: entry.files as string[],
    });
  }

  return entries.length > 0 ? entries : null;
}

async function fetchIndexJson(
  indexUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  try {
    const response = await fetchImpl(indexUrl, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function fetchBytes(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!response.ok) {
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchV1Skill(
  entry: Extract<NormalizedEntry, { version: '0.1.0' }>,
  candidate: IndexCandidate,
  fetchImpl: typeof fetch,
): Promise<Array<{ path: string; content: Uint8Array }> | null> {
  const skillBaseUrl = `${candidate.skillBaseUrl}/${entry.name}`;
  const files: Array<{ path: string; content: Uint8Array }> = [];

  for (const filePath of entry.files) {
    const content = await fetchBytes(
      `${skillBaseUrl}/${filePath}`,
      FETCH_TIMEOUT_MS,
      fetchImpl,
    );
    if (content === null) {
      return null;
    }
    files.push({ path: filePath, content });
  }

  return files;
}

async function fetchV2Skill(
  entry: Extract<NormalizedEntry, { version: '0.2.0' }>,
  indexUrl: string,
  fetchImpl: typeof fetch,
): Promise<Array<{ path: string; content: Uint8Array }> | null> {
  // ponytail: archive artifacts are skipped until archive extraction lands.
  if (entry.type === 'archive') {
    return null;
  }

  const artifactUrl = new URL(entry.artifactUrl, indexUrl).toString();
  const content = await fetchBytes(artifactUrl, FETCH_TIMEOUT_MS, fetchImpl);
  if (content === null) {
    return null;
  }

  const digest = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  if (digest !== entry.digest) {
    return null;
  }

  return [{ path: 'SKILL.md', content }];
}

async function materializeSkill(
  rootDir: string,
  name: string,
  files: Array<{ path: string; content: Uint8Array }>,
): Promise<void> {
  const skillDir = join(rootDir, 'skills', name);
  for (const file of files) {
    const target = join(skillDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
}

export async function discoverWellKnownSource(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteSourceResult | null> {
  const candidates = buildIndexCandidates(url);

  for (const candidate of candidates) {
    const raw = await fetchIndexJson(candidate.indexUrl, fetchImpl);
    const entries = raw ? normalizeIndex(raw) : null;
    if (!entries) {
      continue;
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'skls-mgr-wellknown-'));
    try {
      let materializedCount = 0;
      for (const entry of entries) {
        const files =
          entry.version === '0.1.0'
            ? await fetchV1Skill(entry, candidate, fetchImpl)
            : await fetchV2Skill(entry, candidate.indexUrl, fetchImpl);
        if (files) {
          await materializeSkill(tempDir, entry.name, files);
          materializedCount += 1;
        }
      }
      // An index with no fetchable skills (all digests mismatch, archive-only
      // entries, missing files) should let the caller fall back to a direct
      // download of the URL rather than reporting a misleading empty source.
      if (materializedCount === 0) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        return null;
      }
      return { rootDir: tempDir, tempDir };
    } catch {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      return null;
    }
  }

  return null;
}
