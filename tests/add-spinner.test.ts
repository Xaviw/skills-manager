import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as prompts from '@clack/prompts';
import * as baseDirModule from '../src/base-dir.js';
import * as gitModule from '../src/git.js';
import * as progressSpinnerModule from '../src/progress-spinner.js';
import { runAdd } from '../src/add.js';
import { t } from '../src/i18n.js';
import * as skillLockModule from '../src/skill-lock.js';
import * as skillsModule from '../src/skills.js';
import type { Skill } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  isCancel: vi.fn(() => false),
  text: vi.fn(),
  spinner: vi.fn(),
  cancel: vi.fn(),
  log: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../src/base-dir.js', () => ({
  hasBaseSkillDirectory: vi.fn(async () => false),
  installSkillToBaseDir: vi.fn(async () => {}),
}));

vi.mock('../src/git.js', () => ({
  cloneRepo: vi.fn(),
  cleanupTempDir: vi.fn(async () => {}),
}));

vi.mock('../src/paths.js', () => ({
  ensureBaseDir: vi.fn(async () => {}),
  getBaseDir: vi.fn(() => join(tmpdir(), 'skls-mgr-base')),
}));

vi.mock('../src/skill-lock.js', () => ({
  fetchSkillFolderHash: vi.fn(),
  getGitHubToken: vi.fn(() => null),
}));

vi.mock('../src/skills.js', () => ({
  discoverSkills: vi.fn(),
  filterSkills: vi.fn((skills: Skill[], inputNames: string[]) => {
    const normalizedInputs = inputNames.map((name) => name.toLowerCase());
    return skills.filter((skill) =>
      normalizedInputs.includes(skill.name.toLowerCase()),
    );
  }),
}));

vi.mock('../src/progress-spinner.js', () => ({
  createProgressSpinner: vi.fn(),
}));

describe('add command spinner', () => {
  const sourceRepo = join(tmpdir(), 'skls-mgr-source-spinner');
  const sourceSkill: Skill = {
    name: 'agent-browser',
    description: 'Browser automation',
    path: join(sourceRepo, 'skills', 'agent-browser'),
  };
  let originalIsTTY: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    vi.restoreAllMocks();
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(gitModule.cloneRepo).mockResolvedValue(sourceRepo);
    vi.mocked(skillsModule.discoverSkills).mockResolvedValue([sourceSkill]);
    vi.mocked(skillLockModule.fetchSkillFolderHash).mockResolvedValue('hash-1');
    vi.mocked(baseDirModule.hasBaseSkillDirectory).mockResolvedValue(false);
    vi.mocked(baseDirModule.installSkillToBaseDir).mockResolvedValue(
      join(tmpdir(), 'installed-agent-browser'),
    );
    vi.mocked(progressSpinnerModule.createProgressSpinner).mockReset();
  });

  it('renders spinner progress while cloning and fetching metadata for GitHub sources', async () => {
    const loadSpinner = {
      start: vi.fn(),
      message: vi.fn(),
      stop: vi.fn(),
    };
    const metadataSpinner = {
      start: vi.fn(),
      message: vi.fn(),
      stop: vi.fn(),
    };

    vi.mocked(progressSpinnerModule.createProgressSpinner)
      .mockImplementationOnce(() => loadSpinner as never)
      .mockImplementationOnce(() => metadataSpinner as never);

    await runAdd('https://github.com/owner/repo', {
      skill: ['agent-browser'],
    });

    expect(progressSpinnerModule.createProgressSpinner).toHaveBeenCalledTimes(
      2,
    );
    expect(loadSpinner.start).toHaveBeenCalledWith(
      t('cloningSourceRepository'),
    );
    expect(loadSpinner.message).toHaveBeenCalledWith(
      t('discoveringSkillsInSource'),
    );
    expect(loadSpinner.stop).toHaveBeenCalledWith(
      t('discoveringSkillsInSource'),
    );
    expect(metadataSpinner.start).toHaveBeenCalledWith(
      t('fetchingSkillMetadataProgress', {
        current: 0,
        total: 1,
        skillName: '',
      }),
    );
    expect(metadataSpinner.message).toHaveBeenCalledWith(
      t('fetchingSkillMetadataProgress', {
        current: 1,
        total: 1,
        skillName: 'agent-browser',
      }),
    );
    expect(metadataSpinner.stop).toHaveBeenCalledWith(
      t('fetchingSkillMetadataProgress', {
        current: 1,
        total: 1,
        skillName: '',
      }),
    );
    expect(gitModule.cloneRepo).toHaveBeenCalledWith(
      'https://github.com/owner/repo.git',
      undefined,
    );
    expect(skillLockModule.fetchSkillFolderHash).toHaveBeenCalledWith(
      'owner/repo',
      'skills/agent-browser/SKILL.md',
      null,
    );
    expect(baseDirModule.installSkillToBaseDir).toHaveBeenCalledWith(
      sourceSkill.path,
      'agent-browser',
      {
        displayName: 'agent-browser',
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo.git',
        skillPath: 'skills/agent-browser/SKILL.md',
        skillFolderHash: 'hash-1',
      },
    );
  });

  afterEach(() => {
    if (originalIsTTY) {
      Object.defineProperty(process.stdout, 'isTTY', originalIsTTY);
    }
  });
});
