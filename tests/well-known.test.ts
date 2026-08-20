import { createHash } from 'crypto';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadSkillMd } from '../src/download.js';
import { discoverWellKnownSource } from '../src/well-known.js';

const DISCOVERY_SCHEMA_V2 =
  'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

function ok(body: unknown, contentType = 'application/json'): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

function skillMd(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

function digestOf(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('well-known discovery', () => {
  it('discovers v1 skills and materializes every listed file', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return ok({
          skills: [
            {
              name: 'feishu-bot',
              description: 'Feishu bot skill',
              files: ['SKILL.md', 'guide.md'],
            },
          ],
        });
      }
      if (url.endsWith('/feishu-bot/SKILL.md')) {
        return ok(skillMd('feishu-bot', 'Feishu bot skill'), 'text/markdown');
      }
      if (url.endsWith('/feishu-bot/guide.md')) {
        return ok('# Guide', 'text/markdown');
      }
      return new Response('not found', { status: 404 });
    });

    const result = await discoverWellKnownSource(
      'https://open.feishu.cn',
      fetchMock as typeof fetch,
    );

    expect(result).not.toBeNull();
    tempDirs.push(result!.tempDir);
    expect(
      readFileSync(
        join(result!.rootDir, 'skills', 'feishu-bot', 'SKILL.md'),
        'utf-8',
      ),
    ).toContain('name: feishu-bot');
    expect(
      readFileSync(
        join(result!.rootDir, 'skills', 'feishu-bot', 'guide.md'),
        'utf-8',
      ),
    ).toBe('# Guide');
  });

  it('verifies v2 artifact digests before materializing', async () => {
    const content = skillMd('web-design', 'Design skill');
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return ok({
          $schema: DISCOVERY_SCHEMA_V2,
          skills: [
            {
              name: 'web-design',
              type: 'skill-md',
              url: '/artifacts/web-design.md',
              digest: digestOf(content),
              description: 'Design skill',
            },
          ],
        });
      }
      if (url.endsWith('/artifacts/web-design.md')) {
        return ok(content, 'text/markdown');
      }
      return new Response('not found', { status: 404 });
    });

    const result = await discoverWellKnownSource(
      'https://example.com',
      fetchMock as typeof fetch,
    );

    expect(result).not.toBeNull();
    tempDirs.push(result!.tempDir);
    expect(
      readFileSync(
        join(result!.rootDir, 'skills', 'web-design', 'SKILL.md'),
        'utf-8',
      ),
    ).toBe(content);
  });

  it('returns null when all v2 artifacts fail digest verification', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/.well-known/agent-skills/index.json')) {
        return ok({
          $schema: DISCOVERY_SCHEMA_V2,
          skills: [
            {
              name: 'tampered',
              type: 'skill-md',
              url: '/artifacts/tampered.md',
              digest: `sha256:${'0'.repeat(64)}`,
              description: 'Tampered skill',
            },
          ],
        });
      }
      if (url.endsWith('/artifacts/tampered.md')) {
        return ok(skillMd('tampered', 'Tampered skill'), 'text/markdown');
      }
      return new Response('not found', { status: 404 });
    });

    const result = await discoverWellKnownSource(
      'https://example.com',
      fetchMock as typeof fetch,
    );

    expect(result).toBeNull();
  });

  it('returns null when no well-known index exists', async () => {
    const fetchMock = vi.fn(
      async () => new Response('not found', { status: 404 }),
    );

    const result = await discoverWellKnownSource(
      'https://open.feishu.cn',
      fetchMock as typeof fetch,
    );

    expect(result).toBeNull();
  });
});

describe('direct download', () => {
  it('downloads a single SKILL.md file into a skills tree', async () => {
    const fetchMock = vi.fn(async () =>
      ok(skillMd('single-skill', 'A single skill'), 'text/markdown'),
    );

    const result = await downloadSkillMd(
      'https://example.com/skill.md',
      fetchMock as typeof fetch,
    );

    expect(result).not.toBeNull();
    tempDirs.push(result!.tempDir);
    expect(
      readFileSync(
        join(result!.rootDir, 'skills', 'single-skill', 'SKILL.md'),
        'utf-8',
      ),
    ).toContain('name: single-skill');
  });

  it('returns null for a non-SKILL.md download', async () => {
    const fetchMock = vi.fn(async () => ok('<html>home</html>', 'text/html'));

    const result = await downloadSkillMd(
      'https://open.feishu.cn',
      fetchMock as typeof fetch,
    );

    expect(result).toBeNull();
  });

  it('sanitizes a malicious frontmatter name so it cannot escape the temp tree', async () => {
    const fetchMock = vi.fn(async () =>
      ok(skillMd('../../../tmp/evil-name', 'Traversal'), 'text/markdown'),
    );

    const result = await downloadSkillMd(
      'https://example.com/skill.md',
      fetchMock as typeof fetch,
    );

    expect(result).not.toBeNull();
    tempDirs.push(result!.tempDir);
    expect(
      existsSync(join(result!.rootDir, 'skills', 'tmp-evil-name', 'SKILL.md')),
    ).toBe(true);
    // No path outside the temp tree was written.
    expect(existsSync(join(result!.rootDir, '..', 'tmp', 'evil-name'))).toBe(
      false,
    );
  });
});
