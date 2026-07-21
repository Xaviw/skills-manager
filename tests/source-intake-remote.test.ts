import { existsSync, rmSync } from 'fs';
import { mkdir, mkdtemp } from 'fs/promises';
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
  });

  afterEach(() => {
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
});
