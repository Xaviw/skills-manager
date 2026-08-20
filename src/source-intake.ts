import { relative } from 'path';
import { downloadSkillMd } from './download.js';
import { cleanupTempDir, cloneRepo } from './git.js';
import { getOwnerRepo, parseSource } from './source-parser.js';
import { inspectSkills } from './skills.js';
import { discoverWellKnownSource } from './well-known.js';
import { t } from './i18n.js';
import type {
  ParsedSource,
  RemoteSourceResult,
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

  if (parsed.type === 'well-known' || parsed.type === 'download') {
    return {
      kind: 'remote',
      url: parsed.url,
      subpath: parsed.subpath,
      wellKnown: parsed.type === 'well-known',
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

/**
 * Materialize a non-git remote source into a temp directory. Well-known URLs
 * are probed for an RFC 8615 skills index first, then fall back to a direct
 * SKILL.md download; hosted-artifact URLs download directly.
 */
async function materializeRemote(
  source: Extract<SourceDescriptor, { kind: 'remote' }>,
): Promise<RemoteSourceResult> {
  const wellKnown = source.wellKnown
    ? await discoverWellKnownSource(source.url)
    : null;
  const remote = wellKnown ?? (await downloadSkillMd(source.url));

  if (!remote) {
    throw new Error(t('remoteSourceNotValidSkill'));
  }

  return remote;
}

export async function withSource<T>(
  input: string | SourceDescriptor,
  consume: (snapshot: SourceSnapshot) => Promise<T>,
): Promise<T> {
  const source =
    typeof input === 'string' ? describeSource(parseSource(input)) : input;
  let tempDir: string | null = null;

  try {
    let sourceDir: string;
    if (source.kind === 'local') {
      sourceDir = source.localPath;
    } else if (source.kind === 'remote') {
      const remote = await materializeRemote(source);
      tempDir = remote.tempDir;
      sourceDir = remote.rootDir;
    } else {
      tempDir = await cloneRepo(source.url, source.ref);
      sourceDir = tempDir;
    }
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
