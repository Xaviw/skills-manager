import * as prompts from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCliLocale, t } from '../src/i18n.js';
import { runFind, searchSkills } from '../src/find.js';

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  isCancel: vi.fn((value) => typeof value === 'symbol'),
  text: vi.fn(),
  log: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}));

describe('find command', () => {
  const locale = resolveCliLocale();
  const exitError = new Error('process.exit');
  let originalFindApiUrl: string | undefined;
  let originalFindSiteUrl: string | undefined;
  let originalSkillsApiUrl: string | undefined;
  let originalSkillsSiteUrl: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFindApiUrl = process.env.SKLS_MGR_FIND_API_URL;
    originalFindSiteUrl = process.env.SKLS_MGR_FIND_SITE_URL;
    originalSkillsApiUrl = process.env.SKILLS_API_URL;
    originalSkillsSiteUrl = process.env.SKILLS_SITE_URL;
    process.env.SKLS_MGR_FIND_API_URL = 'https://skills.example';
    process.env.SKLS_MGR_FIND_SITE_URL = 'https://skills.site';
    delete process.env.SKILLS_API_URL;
    delete process.env.SKILLS_SITE_URL;
  });

  afterEach(() => {
    process.env.SKLS_MGR_FIND_API_URL = originalFindApiUrl;
    process.env.SKLS_MGR_FIND_SITE_URL = originalFindSiteUrl;
    process.env.SKILLS_API_URL = originalSkillsApiUrl;
    process.env.SKILLS_SITE_URL = originalSkillsSiteUrl;
    vi.restoreAllMocks();
  });

  it('normalizes and sorts search results using the vercel-labs skills contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [
          {
            id: 'owner/skills/low-installs',
            name: 'low-installs',
            source: 'owner/skills',
            installs: 120,
          },
          {
            id: 'owner/skills/fallback-source',
            name: 'fallback-source',
            topSource: 'owner/skills',
            installs: '3500',
          },
          {
            id: 'owner/skills/high-installs',
            name: 'high-installs',
            source: 'owner/skills',
            installs: 4200,
          },
        ],
      }),
    });

    const results = await searchSkills('react', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiBase: 'https://skills.example/',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://skills.example/api/search?q=react&limit=10',
    );
    expect(results).toEqual([
      {
        name: 'high-installs',
        slug: 'owner/skills/high-installs',
        source: 'owner/skills',
        installs: 4200,
      },
      {
        name: 'fallback-source',
        slug: 'owner/skills/fallback-source',
        source: 'owner/skills',
        installs: 3500,
      },
      {
        name: 'low-installs',
        slug: 'owner/skills/low-installs',
        source: 'owner/skills',
        installs: 120,
      },
    ]);
  });

  it('prints query results in the upstream-style format without invoking add', async () => {
    const log = vi.fn();
    const runAddImpl = vi.fn();

    await runFind(['react', 'performance'], {
      isInteractive: false,
      log,
      runAddImpl: runAddImpl as never,
      searchSkillsImpl: vi.fn().mockResolvedValue([
        {
          name: 'react-best-practices',
          slug: 'vercel-labs/agent-skills/react-best-practices',
          source: 'vercel-labs/agent-skills',
          installs: 185000,
        },
      ]),
    });

    expect(runAddImpl).not.toHaveBeenCalled();
    expect(log.mock.calls.flat()).toEqual([
      t('findInstallWithAdd', {}, locale),
      '',
      'vercel-labs/agent-skills@react-best-practices (185K installs)',
      `${t('findUrlPrefix', {}, locale)}https://skills.site/vercel-labs/agent-skills/react-best-practices`,
      '',
    ]);
  });

  it('prompts for a query, lets the user select a result, and reuses add', async () => {
    const promptSelect = vi
      .fn()
      .mockResolvedValue('vercel-labs/skills/find-skills::find-skills');
    const runAddImpl = vi.fn().mockResolvedValue(undefined);
    const logPromptHelp = vi.fn();
    const log = vi.fn();

    await runFind([], {
      isInteractive: true,
      log,
      logPromptHelp,
      promptForQuery: vi.fn().mockResolvedValue('discover skills'),
      promptSelect: promptSelect as never,
      runAddImpl: runAddImpl as never,
      searchSkillsImpl: vi.fn().mockResolvedValue([
        {
          name: 'find-skills',
          slug: 'vercel-labs/skills/find-skills',
          source: 'vercel-labs/skills',
          installs: 10234,
        },
        {
          name: 'skill-creator',
          slug: 'vercel-labs/skills/skill-creator',
          source: 'vercel-labs/skills',
          installs: 8900,
        },
      ]),
    });

    expect(logPromptHelp).toHaveBeenCalledWith(t('selectPromptHelp'));
    expect(promptSelect).toHaveBeenCalledWith({
      message: t('selectSkillToAdd'),
      options: [
        {
          value: 'vercel-labs/skills/find-skills::find-skills',
          label: 'find-skills',
          hint: 'vercel-labs/skills · 10.2K installs',
        },
        {
          value: 'vercel-labs/skills/skill-creator::skill-creator',
          label: 'skill-creator',
          hint: 'vercel-labs/skills · 8.9K installs',
        },
      ],
      initialValue: 'vercel-labs/skills/find-skills::find-skills',
    });
    expect(runAddImpl).toHaveBeenCalledWith('vercel-labs/skills', {
      skill: ['find-skills'],
    });
    expect(log.mock.calls.flat()).toEqual([
      '',
      t(
        'findInstallingSkill',
        { skillName: 'find-skills', pkg: 'vercel-labs/skills' },
        locale,
      ),
      '',
      '',
      t(
        'findViewSkillAt',
        { url: 'https://skills.site/vercel-labs/skills/find-skills' },
        locale,
      ),
      '',
    ]);
  });

  it('falls back to slug when source is missing, matching the upstream selection bridge', async () => {
    const promptSelect = vi
      .fn()
      .mockResolvedValue('owner/skills/skill-one::skill-one');
    const runAddImpl = vi.fn().mockResolvedValue(undefined);

    await runFind([], {
      isInteractive: true,
      logPromptHelp: () => {},
      promptForQuery: vi.fn().mockResolvedValue('skill one'),
      promptSelect: promptSelect as never,
      runAddImpl: runAddImpl as never,
      log: vi.fn(),
      searchSkillsImpl: vi.fn().mockResolvedValue([
        {
          name: 'skill-one',
          slug: 'owner/skills/skill-one',
          source: '',
          installs: 42,
        },
      ]),
    });

    expect(runAddImpl).toHaveBeenCalledWith('owner/skills/skill-one', {
      skill: ['skill-one'],
    });
  });

  it('drops malformed API entries that do not include id or name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [
          {
            name: 'missing-id',
            source: 'owner/skills',
          },
          {
            id: 'owner/skills/missing-name',
            source: 'owner/skills',
          },
        ],
      }),
    });

    const results = await searchSkills('broken', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiBase: 'https://skills.example/',
    });

    expect(results).toEqual([]);
  });

  it('returns no results when the search request fails, matching upstream behavior', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}),
    });

    const results = await searchSkills('react', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiBase: 'https://skills.example/',
    });

    expect(results).toEqual([]);
  });

  it('exits when no query is provided in non-interactive mode', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null | undefined,
    ) => {
      throw Object.assign(exitError, { code });
    }) as never);

    await expect(
      runFind([], {
        isInteractive: false,
      }),
    ).rejects.toMatchObject({ code: 1 });
    expect(prompts.log.error).toHaveBeenCalledWith(t('missingFindQuery'));
  });
});
