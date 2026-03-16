import { readdir, readFile, stat } from 'fs/promises';
import { dirname, join, normalize, resolve, sep } from 'path';
import matter from 'gray-matter';
import { t } from './i18n.js';
import type { Skill } from './types.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__']);

async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    const stats = await stat(join(dir, 'SKILL.md'));
    return stats.isFile();
  } catch {
    return false;
  }
}

export function isSubpathSafe(basePath: string, subpath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(join(basePath, subpath)));
  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

export async function parseSkillMd(skillMdPath: string): Promise<Skill | null> {
  try {
    const rawContent = await readFile(skillMdPath, 'utf-8');
    const { data } = matter(rawContent);
    if (typeof data.name !== 'string' || typeof data.description !== 'string') {
      return null;
    }

    return {
      name: data.name,
      description: data.description,
      path: dirname(skillMdPath),
    };
  } catch {
    return null;
  }
}

async function findSkillDirs(dir: string, depth = 0, maxDepth = 5): Promise<string[]> {
  if (depth > maxDepth) {
    return [];
  }

  const currentDir = (await hasSkillMd(dir)) ? [dir] : [];

  try {
    const entries = await readdir(dir, { encoding: 'utf8', withFileTypes: true });
    const nested = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name))
        .map((entry) => findSkillDirs(join(dir, entry.name), depth + 1, maxDepth))
    );

    return [...currentDir, ...nested.flat()];
  } catch {
    return currentDir;
  }
}

export async function discoverSkills(basePath: string, subpath?: string): Promise<Skill[]> {
  if (subpath && !isSubpathSafe(basePath, subpath)) {
    throw new Error(t('invalidSubpath'));
  }

  const searchPath = subpath ? join(basePath, subpath) : basePath;
  const skills: Skill[] = [];
  const seen = new Set<string>();

  if (await hasSkillMd(searchPath)) {
    const skill = await parseSkillMd(join(searchPath, 'SKILL.md'));
    if (skill) {
      skills.push(skill);
      seen.add(skill.name);
    }
  }

  const priorityDirs = [searchPath, join(searchPath, 'skills')];
  for (const dir of priorityDirs) {
    try {
      const entries = await readdir(dir, { encoding: 'utf8', withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skill = await parseSkillMd(join(dir, entry.name, 'SKILL.md'));
        if (skill && !seen.has(skill.name)) {
          skills.push(skill);
          seen.add(skill.name);
        }
      }
    } catch {
      continue;
    }
  }

  if (skills.length === 0) {
    const recursiveDirs = await findSkillDirs(searchPath);
    for (const dir of recursiveDirs) {
      const skill = await parseSkillMd(join(dir, 'SKILL.md'));
      if (skill && !seen.has(skill.name)) {
        skills.push(skill);
        seen.add(skill.name);
      }
    }
  }

  return skills;
}


export function filterSkills(skills: Skill[], inputNames: string[]): Skill[] {
  const normalizedInputs = inputNames.map((name) => name.toLowerCase());
  return skills.filter((skill) => normalizedInputs.includes(skill.name.toLowerCase()));
}
