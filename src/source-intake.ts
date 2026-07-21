import { relative } from 'path';
import { cleanupTempDir, cloneRepo } from './git.js';
import { getOwnerRepo, parseSource } from './source-parser.js';
import { inspectSkills } from './skills.js';
import type {
  ParsedSource,
  SourceDescriptor,
  SourceSnapshot,
} from './types.js';

function describeSource(parsed: ParsedSource): SourceDescriptor {
  if (parsed.type === 'local') {
    return {
      kind: 'local',
      localPath: parsed.localPath!,
      subpath: parsed.subpath,
    };
  }

  return {
    kind: 'git',
    url: parsed.url,
    ref: parsed.ref,
    subpath: parsed.subpath,
    githubRepo: getOwnerRepo(parsed) ?? undefined,
  };
}

export async function withSource<T>(
  input: string | SourceDescriptor,
  consume: (snapshot: SourceSnapshot) => Promise<T>,
): Promise<T> {
  const source =
    typeof input === 'string' ? describeSource(parseSource(input)) : input;
  let tempDir: string | null = null;

  try {
    const sourceDir =
      source.kind === 'local'
        ? source.localPath
        : ((tempDir = await cloneRepo(source.url, source.ref)), tempDir);
    const inspected = await inspectSkills(sourceDir, source.subpath);
    const toSkillPath = (directoryPath: string): string => {
      const relativePath = relative(sourceDir, directoryPath)
        .split('\\')
        .join('/');
      return relativePath ? `${relativePath}/SKILL.md` : 'SKILL.md';
    };
    const compareSkillPath = <T extends { skillPath: string }>(a: T, b: T) =>
      a.skillPath < b.skillPath ? -1 : a.skillPath > b.skillPath ? 1 : 0;
    const skills = inspected.skills
      .map((skill) => ({
        ...skill,
        skillPath: toSkillPath(skill.path),
      }))
      .sort(compareSkillPath);

    const issues = inspected.issues
      .map(({ directory, code }) => ({
        code,
        skillPath: toSkillPath(directory),
      }))
      .sort(compareSkillPath);
    return await consume({ source, skills, issues });
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir).catch(() => {});
    }
  }
}
