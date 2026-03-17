import { existsSync, rmSync } from 'fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDirectoryName } from '../src/add.js';
import { installSkillToBaseDir } from '../src/base-dir.js';
import { resolveCliLocale, t } from '../src/i18n.js';
import { getBaseDir } from '../src/paths.js';
import { readSkillLock } from '../src/skill-lock.js';
import { parseSource } from '../src/source-parser.js';
import { runUpdate } from '../src/update.js';

async function createSkill(
  dir: string,
  name: string,
  body = '# skill',
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} description\n---\n\n${body}\n`,
    'utf-8',
  );
}

describe('core modules', () => {
  let homeDir: string;
  let originalHome: string | undefined;
  const locale = resolveCliLocale();

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'skls-mgr-home-'));
    originalHome = process.env.USERPROFILE;
    process.env.USERPROFILE = homeDir;
    process.env.HOME = homeDir;
  });

  afterEach(() => {
    process.env.USERPROFILE = originalHome;
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
    if (homeDir && existsSync(homeDir)) {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('normalizes Windows-style relative paths before treating them as local sources', () => {
    const parsed = parseSource('.\\skills');

    expect(parsed).toEqual({
      type: 'local',
      url: join(process.cwd(), 'skills'),
      localPath: join(process.cwd(), 'skills'),
    });
  });

  it('extracts owner and repo from GitHub git URLs', async () => {
    const { getOwnerRepo } = await import('../src/source-parser.js');

    expect(
      getOwnerRepo(parseSource('git@github.com:openai/agent-skills.git')),
    ).toBe('openai/agent-skills');
    expect(
      getOwnerRepo(parseSource('ssh://git@github.com/openai/agent-skills.git')),
    ).toBe('openai/agent-skills');
    expect(
      getOwnerRepo(parseSource('https://github.com/openai/agent-skills.git')),
    ).toBe('openai/agent-skills');
    expect(
      getOwnerRepo(parseSource('https://example.com/openai/agent-skills.git')),
    ).toBeNull();
  });

  it('resolves a renamed directory when interactive conflict handling is needed', async () => {
    const skill = {
      name: 'skill-one',
      description: 'desc',
      path: 'C:/tmp/skill-one',
    };
    await mkdir(join(getBaseDir(), 'skill-one'), { recursive: true });

    const resolved = await resolveDirectoryName(
      skill,
      {},
      async () => 'skill-one-copy',
    );
    expect(resolved).toBe('skill-one-copy');
  });

  it('rejects sanitized directory name collisions within the same add operation', async () => {
    const reservedDirectoryNames = new Set<string>();

    await expect(
      resolveDirectoryName(
        { name: 'Foo!', description: 'desc', path: 'C:/tmp/foo-one' },
        { skill: ['Foo!', 'Foo?'] },
        async () => 'ignored',
        reservedDirectoryNames,
      ),
    ).resolves.toBe('foo');

    await expect(
      resolveDirectoryName(
        { name: 'Foo?', description: 'desc', path: 'C:/tmp/foo-two' },
        { skill: ['Foo!', 'Foo?'] },
        async () => 'ignored',
        reservedDirectoryNames,
      ),
    ).rejects.toThrow(
      t('skillDirectoryConflict', { directoryName: 'foo' }, locale),
    );
  });

  it('updates a managed skill and refreshes the stored hash', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    const sourceSkillDir = join(sourceRepo, 'skills', 'skill-one');
    await createSkill(sourceSkillDir, 'skill-one', '# version 2');

    const trackedSource = [
      'owner/repo',
      'with a deliberately long line that should be collapsed for the picker hint',
      'before it reaches the terminal renderer',
    ].join('\n');

    await installSkillToBaseDir(sourceSkillDir, 'skill-one', {
      displayName: 'skill-one',
      source: trackedSource,
      sourceType: 'github',
      sourceUrl: sourceRepo,
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'old-hash',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sha: 'repo-sha',
        tree: [{ path: 'skills/skill-one', type: 'tree', sha: 'new-hash' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const promptMultiselect = vi.fn().mockResolvedValue(['skill-one']);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runUpdate({
      isInteractive: true,
      promptMultiselect: promptMultiselect as never,
      logPromptHelp: () => {},
    });

    const lock = await readSkillLock();
    expect(lock.skills['skill-one']?.skillFolderHash).toBe('new-hash');

    const skillContent = await readFile(
      join(getBaseDir(), 'skill-one', 'SKILL.md'),
      'utf-8',
    );
    expect(skillContent).toContain('# version 2');
    expect(promptMultiselect).toHaveBeenCalledTimes(1);
    const [promptCall] = promptMultiselect.mock.calls;
    const promptOption = promptCall?.[0].options[0];
    expect(promptOption?.value).toBe('skill-one');
    expect(promptOption?.label).toBe('skill-one');
    expect(promptOption?.hint).toContain('owner/repo');
    expect(promptOption?.hint).toContain('...');
    expect(promptOption?.hint).not.toContain('\n');
    expect(logSpy).toHaveBeenCalledWith(
      t('updatedSkills', { count: 1 }, locale),
    );

    rmSync(sourceRepo, { recursive: true, force: true });
  });

  it('updates only the requested skill names without prompting', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    const installedRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-installed-'));
    const sourceSkillOneDir = join(sourceRepo, 'skills', 'skill-one');
    const sourceSkillTwoDir = join(sourceRepo, 'skills', 'skill-two');
    const installedSkillOneDir = join(installedRepo, 'skills', 'skill-one');
    const installedSkillTwoDir = join(installedRepo, 'skills', 'skill-two');

    await createSkill(sourceSkillOneDir, 'skill-one', '# version 2');
    await createSkill(sourceSkillTwoDir, 'skill-two', '# version 2');
    await createSkill(installedSkillOneDir, 'skill-one', '# version 1');
    await createSkill(installedSkillTwoDir, 'skill-two', '# version 1');

    await installSkillToBaseDir(installedSkillOneDir, 'skill-one', {
      displayName: 'skill-one',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: sourceRepo,
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'old-hash-1',
    });

    await installSkillToBaseDir(installedSkillTwoDir, 'skill-two', {
      displayName: 'skill-two',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: sourceRepo,
      skillPath: 'skills/skill-two/SKILL.md',
      skillFolderHash: 'old-hash-2',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sha: 'repo-sha',
        tree: [
          { path: 'skills/skill-one', type: 'tree', sha: 'new-hash-1' },
          { path: 'skills/skill-two', type: 'tree', sha: 'new-hash-2' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const promptMultiselect = vi.fn();
    await runUpdate({
      isInteractive: true,
      promptMultiselect: promptMultiselect as never,
      skillNames: ['skill-two'],
    });

    const lock = await readSkillLock();
    expect(lock.skills['skill-one']?.skillFolderHash).toBe('old-hash-1');
    expect(lock.skills['skill-two']?.skillFolderHash).toBe('new-hash-2');

    const skillOneContent = await readFile(
      join(getBaseDir(), 'skill-one', 'SKILL.md'),
      'utf-8',
    );
    const skillTwoContent = await readFile(
      join(getBaseDir(), 'skill-two', 'SKILL.md'),
      'utf-8',
    );
    expect(skillOneContent).toContain('# version 1');
    expect(skillTwoContent).toContain('# version 2');
    expect(promptMultiselect).not.toHaveBeenCalled();

    rmSync(sourceRepo, { recursive: true, force: true });
    rmSync(installedRepo, { recursive: true, force: true });
  });

  it('exits when a requested skill is missing', async () => {
    const exitError = new Error('process.exit');
    vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null | undefined,
    ) => {
      throw Object.assign(exitError, { code });
    }) as never);

    await expect(
      runUpdate({ skillNames: ['missing-skill'] }),
    ).rejects.toMatchObject({ code: 1 });
  });

  it('exits when a requested skill exists but cannot be updated', async () => {
    const localSource = await mkdtemp(join(tmpdir(), 'skls-mgr-local-'));
    const localSkillDir = join(localSource, 'local-skill');
    await createSkill(localSkillDir, 'local-skill', '# local version');

    await installSkillToBaseDir(localSkillDir, 'local-skill', {
      displayName: 'local-skill',
      source: localSource,
      sourceType: 'local',
      sourceUrl: localSource,
      skillPath: 'SKILL.md',
      skillFolderHash: '',
    });

    const exitError = new Error('process.exit');
    vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null | undefined,
    ) => {
      throw Object.assign(exitError, { code });
    }) as never);

    await expect(
      runUpdate({ skillNames: ['local-skill'] }),
    ).rejects.toMatchObject({ code: 1 });

    rmSync(localSource, { recursive: true, force: true });
  });

  it('updates GitHub-backed git URL skills when tracking metadata is present', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    const sourceSkillDir = join(sourceRepo, 'skills', 'skill-one');
    await createSkill(sourceSkillDir, 'skill-one', '# version 2');

    await installSkillToBaseDir(sourceSkillDir, 'skill-one', {
      displayName: 'skill-one',
      source: 'owner/repo',
      sourceType: 'git',
      sourceUrl: sourceRepo,
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'old-hash',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sha: 'repo-sha',
        tree: [{ path: 'skills/skill-one', type: 'tree', sha: 'new-hash' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const promptMultiselect = vi.fn().mockResolvedValue(['skill-one']);
    await runUpdate({
      isInteractive: true,
      promptMultiselect: promptMultiselect as never,
      logPromptHelp: () => {},
    });

    const lock = await readSkillLock();
    expect(lock.skills['skill-one']?.skillFolderHash).toBe('new-hash');

    const skillContent = await readFile(
      join(getBaseDir(), 'skill-one', 'SKILL.md'),
      'utf-8',
    );
    expect(skillContent).toContain('# version 2');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rmSync(sourceRepo, { recursive: true, force: true });
  });

  it('continues updating other selected skills when one update fails', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    const validSkillDir = join(sourceRepo, 'skills', 'skill-one');
    const missingSkillDir = join(sourceRepo, 'skills', 'skill-two');
    await createSkill(validSkillDir, 'skill-one', '# version 2');
    await createSkill(missingSkillDir, 'skill-two', '# version 1');

    await installSkillToBaseDir(validSkillDir, 'skill-one', {
      displayName: 'skill-one',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: sourceRepo,
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'old-hash-1',
    });

    await installSkillToBaseDir(missingSkillDir, 'skill-two', {
      displayName: 'skill-two',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: sourceRepo,
      skillPath: 'skills/missing-skill/SKILL.md',
      skillFolderHash: 'old-hash-2',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sha: 'repo-sha',
        tree: [
          { path: 'skills/skill-one', type: 'tree', sha: 'new-hash-1' },
          { path: 'skills/missing-skill', type: 'tree', sha: 'new-hash-2' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const promptMultiselect = vi
      .fn()
      .mockResolvedValue(['skill-one', 'skill-two']);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const originalExitCode = process.exitCode;

    await runUpdate({
      isInteractive: true,
      promptMultiselect: promptMultiselect as never,
      logPromptHelp: () => {},
    });

    const lock = await readSkillLock();
    expect(lock.skills['skill-one']?.skillFolderHash).toBe('new-hash-1');
    expect(lock.skills['skill-two']?.skillFolderHash).toBe('old-hash-2');
    expect(process.exitCode).toBe(1);

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain(t('updatedSkills', { count: 1 }, locale));
    expect(output).toContain(t('failedUpdates', {}, locale));
    expect(output).toContain(
      `skill-two: ${t('couldNotLocateSkillInSource', {}, locale)}`,
    );

    process.exitCode = originalExitCode;
    rmSync(sourceRepo, { recursive: true, force: true });
  });

  it('reports spinner progress while checking and updating skills', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    const sourceSkillDir = join(sourceRepo, 'skills', 'skill-one');
    await createSkill(sourceSkillDir, 'skill-one', '# version 2');

    await installSkillToBaseDir(sourceSkillDir, 'skill-one', {
      displayName: 'skill-one',
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: sourceRepo,
      skillPath: 'skills/skill-one/SKILL.md',
      skillFolderHash: 'old-hash',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sha: 'repo-sha',
        tree: [{ path: 'skills/skill-one', type: 'tree', sha: 'new-hash' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const checkSpinner = {
      start: vi.fn(),
      message: vi.fn(),
      stop: vi.fn(),
    };
    const updateSpinner = {
      start: vi.fn(),
      message: vi.fn(),
      stop: vi.fn(),
    };
    const createSpinner = vi
      .fn<
        () => {
          start: (msg?: string) => void;
          message: (msg?: string) => void;
          stop: (msg?: string) => void;
        }
      >()
      .mockImplementationOnce(() => checkSpinner)
      .mockImplementationOnce(() => updateSpinner);

    await runUpdate({
      skillNames: ['skill-one'],
      createSpinner,
      shouldRenderProgress: true,
    });

    expect(createSpinner).toHaveBeenCalledTimes(2);
    expect(checkSpinner.start).toHaveBeenCalledWith(
      t(
        'checkingSkillUpdatesProgress',
        { current: 0, total: 1, skillName: '' },
        locale,
      ),
    );
    expect(checkSpinner.message).toHaveBeenCalledWith(
      t(
        'checkingSkillUpdatesProgress',
        { current: 1, total: 1, skillName: 'skill-one' },
        locale,
      ),
    );
    expect(checkSpinner.stop).toHaveBeenCalledWith(
      t(
        'checkingSkillUpdatesProgress',
        { current: 1, total: 1, skillName: '' },
        locale,
      ),
    );
    expect(updateSpinner.start).toHaveBeenCalledWith(
      t(
        'updatingSkillsProgress',
        { current: 0, total: 1, skillName: '' },
        locale,
      ),
    );
    expect(updateSpinner.message).toHaveBeenCalledWith(
      t(
        'updatingSkillsProgress',
        { current: 1, total: 1, skillName: 'skill-one' },
        locale,
      ),
    );
    expect(updateSpinner.stop).toHaveBeenCalledWith(
      t(
        'updatingSkillsProgress',
        { current: 1, total: 1, skillName: '' },
        locale,
      ),
    );

    rmSync(sourceRepo, { recursive: true, force: true });
  });

  it('limits concurrent update checks to the configured concurrency', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    const tree = [
      { path: 'skills/skill-one', type: 'tree', sha: 'hash-one' },
      { path: 'skills/skill-two', type: 'tree', sha: 'hash-two' },
      { path: 'skills/skill-three', type: 'tree', sha: 'hash-three' },
      { path: 'skills/skill-four', type: 'tree', sha: 'hash-four' },
      { path: 'skills/skill-five', type: 'tree', sha: 'hash-five' },
    ];

    for (const [index, skillName] of [
      'skill-one',
      'skill-two',
      'skill-three',
      'skill-four',
      'skill-five',
    ].entries()) {
      const sourceSkillDir = join(sourceRepo, 'skills', skillName);
      await createSkill(sourceSkillDir, skillName, `# version ${index + 1}`);
      await installSkillToBaseDir(sourceSkillDir, skillName, {
        displayName: skillName,
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: sourceRepo,
        skillPath: `skills/${skillName}/SKILL.md`,
        skillFolderHash: tree[index]!.sha,
      });
    }

    let activeRequests = 0;
    let maxConcurrentRequests = 0;
    const fetchMock = vi.fn(async () => {
      activeRequests += 1;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRequests -= 1;
      return {
        ok: true,
        json: async () => ({
          sha: 'repo-sha',
          tree,
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runUpdate({
      checkConcurrency: 2,
      shouldRenderProgress: false,
    });

    expect(maxConcurrentRequests).toBe(2);
    expect(logSpy).toHaveBeenCalledWith(t('allSkillsUpToDate', {}, locale));

    rmSync(sourceRepo, { recursive: true, force: true });
  });
});
