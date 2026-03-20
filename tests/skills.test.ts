import { existsSync, rmSync } from 'fs';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverSkills, filterSkills, parseSkillMd } from '../src/skills.js';

describe('skills discovery helpers', () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('returns null when SKILL.md frontmatter does not contain string fields', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'skls-mgr-skill-md-'));
    createdDirs.push(rootDir);
    const skillMdPath = join(rootDir, 'SKILL.md');

    await writeFile(
      skillMdPath,
      '---\nname: 123\ndescription: false\n---\n\n# Invalid\n',
      'utf-8',
    );

    expect(await parseSkillMd(skillMdPath)).toBeNull();
  });

  it('recursively discovers nested skills when no priority directories contain skills', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'skls-mgr-discover-'));
    createdDirs.push(rootDir);
    const nestedSkillDir = join(rootDir, 'packages', 'nested', 'agent-browser');

    await mkdir(nestedSkillDir, { recursive: true });
    await writeFile(
      join(nestedSkillDir, 'SKILL.md'),
      '---\nname: agent-browser\ndescription: Browser automation\n---\n',
      'utf-8',
    );

    expect(await discoverSkills(rootDir)).toEqual([
      {
        name: 'agent-browser',
        description: 'Browser automation',
        path: nestedSkillDir,
      },
    ]);
  });

  it('deduplicates duplicate skill names discovered from root and nested directories', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'skls-mgr-dedupe-'));
    createdDirs.push(rootDir);

    await writeFile(
      join(rootDir, 'SKILL.md'),
      '---\nname: root-skill\ndescription: Root\n---\n',
      'utf-8',
    );
    await mkdir(join(rootDir, 'skills', 'duplicate'), { recursive: true });
    await writeFile(
      join(rootDir, 'skills', 'duplicate', 'SKILL.md'),
      '---\nname: root-skill\ndescription: Duplicate\n---\n',
      'utf-8',
    );

    const skills = await discoverSkills(rootDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.path).toBe(rootDir);
  });

  it('rejects unsafe discovery subpaths', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'skls-mgr-subpath-'));
    createdDirs.push(rootDir);

    await expect(discoverSkills(rootDir, '../outside')).rejects.toThrow();
  });

  it('filters skills by case-insensitive exact name matches', () => {
    expect(
      filterSkills(
        [
          {
            name: 'Agent-Browser',
            description: 'Browser automation',
            path: '/tmp/agent-browser',
          },
          { name: 'React', description: 'React', path: '/tmp/react' },
        ],
        ['agent-browser'],
      ),
    ).toEqual([
      {
        name: 'Agent-Browser',
        description: 'Browser automation',
        path: '/tmp/agent-browser',
      },
    ]);
  });
});
