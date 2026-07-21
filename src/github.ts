import { execSync } from 'child_process';

export function getGitHubToken(): string | null {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }

  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}

export async function fetchSkillFolderHashes(
  ownerRepo: string,
  skillPaths: string[],
  token?: string | null,
  ref?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, string>> {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'skls-mgr',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    let branch = ref;
    if (!branch) {
      const repositoryResponse = await fetchImpl(
        `https://api.github.com/repos/${ownerRepo}`,
        { headers },
      );
      if (!repositoryResponse.ok) {
        return {};
      }
      const repository = (await repositoryResponse.json()) as {
        default_branch?: unknown;
      };
      if (typeof repository.default_branch !== 'string') {
        return {};
      }
      branch = repository.default_branch;
    }

    const response = await fetchImpl(
      `https://api.github.com/repos/${ownerRepo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers },
    );
    if (!response.ok) {
      return {};
    }

    const data = (await response.json()) as {
      sha: string;
      tree: Array<{ path: string; type: string; sha: string }>;
    };
    const hashes: Record<string, string> = {};

    for (const skillPath of skillPaths) {
      const normalizedPath = skillPath.replace(/\\/g, '/');
      const folderPath = normalizedPath.endsWith('/SKILL.md')
        ? normalizedPath.slice(0, -9)
        : normalizedPath === 'SKILL.md'
          ? ''
          : normalizedPath;
      if (!folderPath) {
        hashes[skillPath] = data.sha;
        continue;
      }

      const entry = data.tree.find(
        (item) => item.type === 'tree' && item.path === folderPath,
      );
      if (entry) {
        hashes[skillPath] = entry.sha;
      }
    }

    return hashes;
  } catch {
    return {};
  }
}
