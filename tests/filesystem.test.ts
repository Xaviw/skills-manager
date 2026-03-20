import * as fsPromises from 'fs/promises';
import { existsSync, rmSync } from 'fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyDirectory,
  createDirectorySymlink,
  replaceDirectoryWithCopy,
  sanitizeName,
} from '../src/filesystem.js';

vi.mock('fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    rename: vi.fn(actual.rename),
  };
});

describe('filesystem helpers', () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of createdDirs.splice(0)) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('sanitizes traversal-like and degenerate names safely', () => {
    expect(sanitizeName('../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeName('..\\..\\secret')).toBe('secret');
    expect(sanitizeName('...')).toBe('unnamed-skill');
    expect(sanitizeName('Skill Name')).toBe('skill-name');
  });

  it('copies directories while excluding hidden and generated files', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'skls-mgr-files-'));
    createdDirs.push(rootDir);
    const sourceDir = join(rootDir, 'source');
    const targetDir = join(rootDir, 'target');

    await mkdir(join(sourceDir, '.git'), { recursive: true });
    await mkdir(join(sourceDir, 'node_modules', 'dep'), { recursive: true });
    await mkdir(join(sourceDir, 'nested'), { recursive: true });
    await writeFile(join(sourceDir, 'visible.txt'), 'visible', 'utf-8');
    await writeFile(join(sourceDir, '.hidden'), 'hidden', 'utf-8');
    await writeFile(join(sourceDir, 'metadata.json'), '{}', 'utf-8');
    await writeFile(join(sourceDir, 'nested', 'child.txt'), 'child', 'utf-8');
    await writeFile(join(sourceDir, '.git', 'config'), 'git', 'utf-8');
    await writeFile(
      join(sourceDir, 'node_modules', 'dep', 'index.js'),
      'dep',
      'utf-8',
    );

    await copyDirectory(sourceDir, targetDir);

    expect(await readFile(join(targetDir, 'visible.txt'), 'utf-8')).toBe(
      'visible',
    );
    expect(
      await readFile(join(targetDir, 'nested', 'child.txt'), 'utf-8'),
    ).toBe('child');
    expect(existsSync(join(targetDir, '.hidden'))).toBe(false);
    expect(existsSync(join(targetDir, 'metadata.json'))).toBe(false);
    expect(existsSync(join(targetDir, '.git'))).toBe(false);
    expect(existsSync(join(targetDir, 'node_modules'))).toBe(false);
  });

  it('replaces incorrect directory links with a symlink to the requested target', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'skls-mgr-links-'));
    createdDirs.push(rootDir);
    const targetDir = join(rootDir, 'actual-skill');
    const wrongTargetDir = join(rootDir, 'wrong-skill');
    const linkPath = join(rootDir, 'skill-link');

    await mkdir(targetDir, { recursive: true });
    await mkdir(wrongTargetDir, { recursive: true });
    await writeFile(join(targetDir, 'SKILL.md'), '# ok', 'utf-8');
    await fsPromises.symlink(
      wrongTargetDir,
      linkPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    expect(await createDirectorySymlink(targetDir, linkPath)).toBe(true);
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(join(linkPath, 'SKILL.md'), 'utf-8')).toBe('# ok');
  });

  it('restores the original target directory if replacement fails mid-flight', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'skls-mgr-replace-'));
    createdDirs.push(rootDir);
    const sourceDir = join(rootDir, 'source');
    const targetDir = join(rootDir, 'target');

    await mkdir(sourceDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(sourceDir, 'new.txt'), 'new', 'utf-8');
    await writeFile(join(targetDir, 'old.txt'), 'old', 'utf-8');

    const originalRename = fsPromises.rename;
    let renameCallCount = 0;
    vi.mocked(fsPromises.rename).mockImplementation(async (...args) => {
      renameCallCount += 1;
      if (renameCallCount === 2) {
        throw new Error('rename failed');
      }
      return await originalRename(...args);
    });

    await expect(
      replaceDirectoryWithCopy(sourceDir, targetDir),
    ).rejects.toThrow('rename failed');
    expect(await readFile(join(targetDir, 'old.txt'), 'utf-8')).toBe('old');
    expect(existsSync(join(targetDir, 'new.txt'))).toBe(false);

    const siblingNames = await readdir(rootDir);
    expect(siblingNames.some((name) => name.includes('.tmp-'))).toBe(false);
    expect(siblingNames.some((name) => name.includes('.bak-'))).toBe(false);
  });
});
