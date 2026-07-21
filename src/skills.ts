import { lstat, readdir, readFile, realpath, stat } from 'fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from 'path';
import matter from 'gray-matter';
import { t } from './i18n.js';
import type { Skill, SourceIssue } from './types.js';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
]);

async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    const stats = await stat(join(dir, 'SKILL.md'));
    return stats.isFile();
  } catch {
    return false;
  }
}

function isSubpathSafe(basePath: string, subpath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(join(basePath, subpath)));
  return (
    normalizedTarget.startsWith(normalizedBase + sep) ||
    normalizedTarget === normalizedBase
  );
}

function isRealPathContained(basePath: string, targetPath: string): boolean {
  const relativePath = relative(basePath, targetPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== '..' &&
      !isAbsolute(relativePath))
  );
}

async function readSkillMd(skillMdPath: string): Promise<{
  skill: Skill | null;
  issue?: SourceIssue['code'];
}> {
  let rawContent: string;
  try {
    rawContent = await readFile(skillMdPath, 'utf-8');
  } catch {
    return { skill: null, issue: 'unreadable-skill' };
  }

  try {
    const { data } = matter(rawContent);
    if (
      typeof data.name !== 'string' ||
      typeof data.description !== 'string' ||
      !data.name.trim() ||
      !data.description.trim()
    ) {
      return { skill: null, issue: 'invalid-skill' };
    }

    return {
      skill: {
        name: data.name.trim(),
        description: data.description.trim(),
        path: dirname(skillMdPath),
      },
    };
  } catch {
    return { skill: null, issue: 'invalid-skill' };
  }
}

async function findSkillDirs(dir: string): Promise<string[]> {
  const currentDir = (await hasSkillMd(dir)) ? [dir] : [];

  const entries = await readdir(dir, {
    encoding: 'utf8',
    withFileTypes: true,
  });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name))
      .map((entry) => findSkillDirs(join(dir, entry.name))),
  );

  return [...currentDir, ...nested.flat()];
}

export async function inspectSkills(
  basePath: string,
  subpath?: string,
): Promise<{
  skills: Skill[];
  issues: Array<{ directory: string; code: SourceIssue['code'] }>;
}> {
  if (subpath && !isSubpathSafe(basePath, subpath)) {
    throw new Error(t('invalidSubpath'));
  }

  const searchPath = subpath ? join(basePath, subpath) : basePath;
  const skills: Skill[] = [];
  const issues: Array<{ directory: string; code: SourceIssue['code'] }> = [];
  const [realBasePath, realSearchPath, searchPathStats] = await Promise.all([
    realpath(basePath),
    realpath(searchPath),
    lstat(searchPath),
  ]);
  if (
    !isRealPathContained(realBasePath, realSearchPath) ||
    (subpath && searchPathStats.isSymbolicLink())
  ) {
    throw new Error(t('invalidSubpath'));
  }

  const recursiveDirs = await findSkillDirs(searchPath);
  for (const dir of recursiveDirs) {
    const skillMdPath = join(dir, 'SKILL.md');
    try {
      const [realDirectory, realSkillMdPath, skillMdStats] = await Promise.all([
        realpath(dir),
        realpath(skillMdPath),
        lstat(skillMdPath),
      ]);
      const isContained = [realDirectory, realSkillMdPath].every((path) =>
        isRealPathContained(realBasePath, path),
      );
      if (!isContained) {
        issues.push({ directory: dir, code: 'outside-source' });
        continue;
      }
      if (!skillMdStats.isFile()) {
        issues.push({ directory: dir, code: 'invalid-skill' });
        continue;
      }
    } catch {
      issues.push({ directory: dir, code: 'unreadable-skill' });
      continue;
    }

    const result = await readSkillMd(skillMdPath);
    if (result.skill) {
      skills.push(result.skill);
    } else if (result.issue) {
      issues.push({ directory: dir, code: result.issue });
    }
  }

  return { skills, issues };
}
