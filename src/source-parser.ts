import { homedir } from 'os';
import { isAbsolute, resolve } from 'path';
import { t } from './i18n.js';
import type { ParsedSource } from './types.js';

function isLocalPath(input: string): boolean {
  const normalizedInput = input.replace(/\\/g, '/');

  return (
    isAbsolute(normalizedInput) ||
    normalizedInput === '~' ||
    normalizedInput.startsWith('~/') ||
    normalizedInput.startsWith('./') ||
    normalizedInput.startsWith('../') ||
    normalizedInput === '.' ||
    normalizedInput === '..' ||
    /^[a-zA-Z]:[/\\]/.test(normalizedInput)
  );
}

export function sanitizeSubpath(subpath: string): string {
  const normalized = subpath.replace(/\\/g, '/');
  for (const segment of normalized.split('/')) {
    if (segment === '..') {
      throw new Error(t('unsafeSubpath', { subpath }));
    }
  }
  return normalized;
}

export function getOwnerRepo(parsed: ParsedSource): string | null {
  if (parsed.type !== 'github' && parsed.type !== 'git') {
    return null;
  }

  const normalizedUrl = parsed.url.replace(/\/$/, '');
  const match = normalizedUrl.match(
    /(?:git@|https?:\/\/|ssh:\/\/git@)?github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/,
  );
  if (!match) {
    return null;
  }

  return `${match[1]}/${match[2]}`;
}

export function parseSource(input: string): ParsedSource {
  const normalizedInput = input.replace(/\\/g, '/');

  if (isLocalPath(normalizedInput)) {
    const localPath = resolveLocalPath(normalizedInput);
    return {
      type: 'local',
      url: localPath,
      localPath,
    };
  }

  const githubTreeWithPathMatch = normalizedInput.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/,
  );
  if (githubTreeWithPathMatch) {
    const [, owner, repo, ref, subpath] = githubTreeWithPathMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ref,
      subpath: sanitizeSubpath(subpath!),
    };
  }

  const githubTreeMatch = normalizedInput.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/,
  );
  if (githubTreeMatch) {
    const [, owner, repo, ref] = githubTreeMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ref,
    };
  }

  const githubRepoMatch = normalizedInput.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  );
  if (githubRepoMatch) {
    const [, owner, repo] = githubRepoMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
    };
  }

  const shorthandMatch = normalizedInput.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/);
  if (
    shorthandMatch &&
    !normalizedInput.includes(':') &&
    !normalizedInput.startsWith('.')
  ) {
    const [, owner, repo, subpath] = shorthandMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      subpath: subpath ? sanitizeSubpath(subpath) : undefined,
    };
  }

  if (isHostedArtifactUrl(normalizedInput)) {
    return {
      type: 'download',
      url: normalizedInput,
    };
  }

  if (isWellKnownUrl(normalizedInput)) {
    return {
      type: 'well-known',
      url: normalizedInput,
    };
  }

  return {
    type: 'git',
    url: input,
  };
}

/**
 * Raw file / archive / release asset URLs that must be downloaded directly
 * instead of being normalized to their parent repository and cloned.
 */
function isHostedArtifactUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();

    if (
      host === 'raw.githubusercontent.com' ||
      host === 'codeload.github.com' ||
      host === 'objects.githubusercontent.com'
    ) {
      return true;
    }

    if (host === 'github.com') {
      return /^\/[^/]+\/[^/]+\/(?:archive\/|raw\/|releases\/(?:download\/|latest\/download\/))/.test(
        parsed.pathname,
      );
    }

    if (host === 'gitlab.com') {
      return /\/-(?:archive|raw)\//.test(parsed.pathname);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * An HTTP(S) URL that is not a known git host and does not look like a git
 * repository. Callers should try well-known discovery first, then fall back
 * to downloading the URL as a SKILL.md file.
 */
function isWellKnownUrl(input: string): boolean {
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    return false;
  }

  try {
    const parsed = new URL(input);
    const excludedHosts = [
      'github.com',
      'gitlab.com',
      'raw.githubusercontent.com',
    ];
    if (excludedHosts.includes(parsed.hostname)) {
      return false;
    }

    if (input.endsWith('.git')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function resolveLocalPath(input: string): string {
  if (input === '~') {
    return homedir();
  }

  if (input.startsWith('~/')) {
    return resolve(homedir(), input.slice(2));
  }

  return resolve(input);
}
