import { existsSync, rmSync } from 'fs';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as git from '../src/git.js';
import { withSource } from '../src/source-intake.js';
import type { SourceSnapshot } from '../src/types.js';

vi.mock('../src/git.js', () => ({
  cloneRepo: vi.fn(),
  cleanupTempDir: vi.fn(),
}));

describe('remote source intake', () => {
  const createdDirs: string[] = [];

  beforeEach(() => {
    vi.mocked(git.cloneRepo).mockReset();
    vi.mocked(git.cleanupTempDir).mockReset();
    vi.mocked(git.cleanupTempDir).mockImplementation(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const dir of createdDirs.splice(0)) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('replays the parsed ref and cleans up after the consumer fails', async () => {
    const cloneDir = await mkdtemp(join(tmpdir(), 'skls-mgr-intake-clone-'));
    createdDirs.push(cloneDir);
    await mkdir(join(cloneDir, 'skills', 'example'), { recursive: true });
    const failure = new Error('consumer failed');
    let snapshot: SourceSnapshot | undefined;
    vi.mocked(git.cloneRepo).mockResolvedValue(cloneDir);
    vi.mocked(git.cleanupTempDir).mockResolvedValue();

    await expect(
      withSource(
        'https://github.com/owner/repo/tree/feature/skills/example',
        async (value) => {
          snapshot = value;
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    expect(git.cloneRepo).toHaveBeenCalledWith(
      'https://github.com/owner/repo.git',
      'feature',
    );
    expect(git.cleanupTempDir).toHaveBeenCalledWith(cloneDir);
    expect(snapshot?.source).toEqual({
      kind: 'git',
      url: 'https://github.com/owner/repo.git',
      ref: 'feature',
      subpath: 'skills/example',
      githubRepo: 'owner/repo',
    });
  });

  it('discovers well-known skills without cloning', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return new Response('not found', { status: 404 });
      }
      if (url.endsWith('/.well-known/skills/index.json')) {
        return new Response(
          JSON.stringify({
            skills: [
              {
                name: 'feishu-bot',
                description: 'Feishu bot',
                files: ['SKILL.md'],
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      if (url.endsWith('/feishu-bot/SKILL.md')) {
        return new Response(
          '---\nname: feishu-bot\ndescription: Feishu bot\n---\n',
          {
            status: 200,
            headers: { 'content-type': 'text/markdown' },
          },
        );
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await withSource(
      'https://example.com',
      async (value) => value,
    );

    expect(snapshot.source).toEqual({
      kind: 'remote',
      url: 'https://example.com',
      wellKnown: true,
    });
    expect(snapshot.skills.map((skill) => skill.skillPath)).toEqual([
      'skills/feishu-bot/SKILL.md',
    ]);
    expect(git.cloneRepo).not.toHaveBeenCalled();
  });

  it('falls back to a direct SKILL.md download without a well-known index', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('---\nname: solo\ndescription: A single skill\n---\n', {
          status: 200,
          headers: { 'content-type': 'text/markdown' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await withSource(
      'https://example.com/skill.md',
      async (value) => value,
    );

    expect(snapshot.source).toEqual({
      kind: 'remote',
      url: 'https://example.com/skill.md',
      wellKnown: true,
    });
    expect(snapshot.skills.map((skill) => skill.skillPath)).toEqual([
      'skills/solo/SKILL.md',
    ]);
    expect(git.cloneRepo).not.toHaveBeenCalled();
  });
});
