import { existsSync, rmSync } from 'fs';
import { mkdir, mkdtemp, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { withSource } from '../src/source-intake.js';

describe('source intake', () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('returns every local skill in deterministic skill-path order', async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), 'skls-mgr-intake-'));
    createdDirs.push(sourceDir);
    const firstDir = join(sourceDir, 'a', 'one');
    const deepDir = join(sourceDir, 'z', '1', '2', '3', '4', '5', '6');

    for (const dir of [firstDir, deepDir]) {
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'SKILL.md'),
        '---\nname: duplicate\ndescription: A skill\n---\n',
        'utf-8',
      );
    }

    const result = await withSource(sourceDir, async (snapshot) => snapshot);

    expect(result.source).toEqual({ kind: 'local', localPath: sourceDir });
    expect(result.skills.map((skill) => skill.skillPath)).toEqual([
      'a/one/SKILL.md',
      'z/1/2/3/4/5/6/SKILL.md',
    ]);
    expect(result.skills.map((skill) => skill.name)).toEqual([
      'duplicate',
      'duplicate',
    ]);
    expect(result.issues).toEqual([]);
  });

  it('reports invalid manifests without hiding valid skills', async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), 'skls-mgr-intake-'));
    createdDirs.push(sourceDir);
    const validDir = join(sourceDir, 'valid');
    const invalidDir = join(sourceDir, 'invalid');
    await mkdir(validDir, { recursive: true });
    await mkdir(invalidDir, { recursive: true });
    await writeFile(
      join(validDir, 'SKILL.md'),
      '---\nname: valid\ndescription: Valid skill\n---\n',
      'utf-8',
    );
    await writeFile(
      join(invalidDir, 'SKILL.md'),
      '---\nname: "   "\ndescription: Missing name\n---\n',
      'utf-8',
    );

    const result = await withSource(sourceDir, async (snapshot) => snapshot);

    expect(result.skills.map((skill) => skill.name)).toEqual(['valid']);
    expect(result.issues).toEqual([
      { code: 'invalid-skill', skillPath: 'invalid/SKILL.md' },
    ]);
  });

  it('fails when the requested local subpath cannot be traversed', async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), 'skls-mgr-intake-'));
    createdDirs.push(sourceDir);

    await expect(
      withSource(
        { kind: 'local', localPath: sourceDir, subpath: 'missing' },
        async (snapshot) => snapshot,
      ),
    ).rejects.toThrow();
  });

  it('rejects a source subpath symlink that escapes the source root', async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), 'skls-mgr-intake-'));
    const outsideDir = await mkdtemp(join(tmpdir(), 'skls-mgr-outside-'));
    createdDirs.push(sourceDir, outsideDir);
    await writeFile(
      join(outsideDir, 'SKILL.md'),
      '---\nname: outside\ndescription: Outside skill\n---\n',
      'utf-8',
    );
    await symlink(
      outsideDir,
      join(sourceDir, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      withSource(
        { kind: 'local', localPath: sourceDir, subpath: 'linked' },
        async (snapshot) => snapshot,
      ),
    ).rejects.toThrow();
  });
});
