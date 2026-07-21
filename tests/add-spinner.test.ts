import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as prompts from '@clack/prompts';
import * as baseDirModule from '../src/base-dir.js';
import * as githubModule from '../src/github.js';
import * as progressSpinnerModule from '../src/progress-spinner.js';
import * as sourceIntakeModule from '../src/source-intake.js';
import { runAdd } from '../src/add.js';
import { t } from '../src/i18n.js';
import type { SourceSkill, SourceSnapshot } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  isCancel: vi.fn(() => false),
  text: vi.fn(),
  spinner: vi.fn(),
  cancel: vi.fn(),
  log: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../src/base-dir.js', () => ({
  listBaseSkills: vi.fn(async () => []),
  installManagedSkill: vi.fn(async () => {}),
}));

vi.mock('../src/git.js', () => ({
  cloneRepo: vi.fn(async () => {
    throw new Error('legacy clone path used');
  }),
  cleanupTempDir: vi.fn(async () => {}),
}));

vi.mock('../src/paths.js', () => ({
  ensureBaseDir: vi.fn(async () => {}),
  getBaseDir: vi.fn(() => join(tmpdir(), 'skls-mgr-base')),
}));

vi.mock('../src/github.js', () => ({
  fetchSkillFolderHashes: vi.fn(),
  getGitHubToken: vi.fn(() => null),
}));

vi.mock('../src/source-intake.js', () => ({
  withSource: vi.fn(),
}));

vi.mock('../src/progress-spinner.js', () => ({
  createProgressSpinner: vi.fn(),
}));

describe('add command spinner', () => {
  const sourceRepo = join(tmpdir(), 'skls-mgr-source-spinner');
  const sourceSkill: SourceSkill = {
    name: 'agent-browser',
    description: 'Browser automation',
    path: join(sourceRepo, 'skills', 'agent-browser'),
    skillPath: 'skills/agent-browser/SKILL.md',
  };
  const sourceSnapshot: SourceSnapshot = {
    source: {
      kind: 'git',
      url: 'https://github.com/owner/repo.git',
      ref: 'release',
      subpath: 'skills/agent-browser',
      githubRepo: 'owner/repo',
    },
    skills: [sourceSkill],
    issues: [],
  };
  let originalIsTTY: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(sourceIntakeModule.withSource).mockImplementation(
      async (_input, consume) => await consume(sourceSnapshot),
    );
    vi.mocked(githubModule.fetchSkillFolderHashes).mockResolvedValue({
      'skills/agent-browser/SKILL.md': 'hash-1',
    });
    vi.mocked(baseDirModule.listBaseSkills).mockResolvedValue([]);
    vi.mocked(baseDirModule.installManagedSkill).mockResolvedValue(undefined);
    vi.mocked(progressSpinnerModule.createProgressSpinner).mockReset();
  });

  it('renders metadata progress for a GitHub source snapshot', async () => {
    const metadataSpinner = {
      start: vi.fn(),
      message: vi.fn(),
      stop: vi.fn(),
    };

    vi.mocked(progressSpinnerModule.createProgressSpinner).mockReturnValue(
      metadataSpinner as never,
    );

    await runAdd(
      'https://github.com/owner/repo/tree/release/skills/agent-browser',
      {
        skill: ['agent-browser'],
      },
    );

    expect(sourceIntakeModule.withSource).toHaveBeenCalledWith(
      'https://github.com/owner/repo/tree/release/skills/agent-browser',
      expect.any(Function),
    );
    expect(progressSpinnerModule.createProgressSpinner).toHaveBeenCalledTimes(
      1,
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
    expect(githubModule.fetchSkillFolderHashes).toHaveBeenCalledWith(
      'owner/repo',
      ['skills/agent-browser/SKILL.md'],
      null,
      'release',
    );
    expect(baseDirModule.installManagedSkill).toHaveBeenCalledWith(
      sourceSkill.path,
      'agent-browser',
      {
        displayName: 'agent-browser',
        source: 'owner/repo',
        sourceType: 'github',
        sourceUrl: 'https://github.com/owner/repo.git',
        sourceRef: 'release',
        skillPath: 'skills/agent-browser/SKILL.md',
        skillFolderHash: 'hash-1',
      },
    );
  });

  it('reuses a directory across equivalent GitHub URLs and refs', async () => {
    vi.mocked(baseDirModule.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'existing-name',
        managed: true,
        path: join(tmpdir(), 'skls-mgr-base', 'existing-name'),
        lockEntry: {
          displayName: 'old-name',
          source: 'Owner/Repo',
          sourceType: 'github',
          sourceUrl: 'git@github.com:Owner/Repo.git',
          sourceRef: 'main',
          skillPath: sourceSkill.skillPath,
          skillFolderHash: 'old-hash',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);

    await runAdd('https://github.com/owner/repo/tree/release', {
      skill: ['agent-browser'],
    });

    expect(baseDirModule.installManagedSkill).toHaveBeenCalledWith(
      sourceSkill.path,
      'existing-name',
      expect.objectContaining({ sourceRef: 'release' }),
    );
  });

  it('keeps the name conflict for a different skillPath in the same repository', async () => {
    vi.mocked(baseDirModule.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'agent-browser',
        managed: true,
        path: join(tmpdir(), 'skls-mgr-base', 'agent-browser'),
        lockEntry: {
          displayName: 'agent-browser',
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo.git',
          skillPath: 'skills/other/SKILL.md',
          skillFolderHash: 'old-hash',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);
    const exitError = new Error('process.exit');
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw exitError;
    }) as never);

    await expect(
      runAdd('https://github.com/owner/repo', {
        skill: ['agent-browser'],
      }),
    ).rejects.toBe(exitError);

    expect(baseDirModule.installManagedSkill).not.toHaveBeenCalled();
    expect(prompts.log.error).toHaveBeenCalledWith(
      t('skillDirectoryConflict', { directoryName: 'agent-browser' }),
    );
  });

  it('rejects duplicate Managed Skill Identities', async () => {
    const lockEntry = {
      displayName: 'agent-browser',
      source: 'owner/repo',
      sourceType: 'github' as const,
      sourceUrl: 'https://github.com/owner/repo.git',
      skillPath: sourceSkill.skillPath,
      skillFolderHash: 'old-hash',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(baseDirModule.listBaseSkills).mockResolvedValue(
      ['one', 'two'].map((directoryName) => ({
        directoryName,
        managed: true,
        path: join(tmpdir(), 'skls-mgr-base', directoryName),
        lockEntry,
      })),
    );
    const exitError = new Error('process.exit');
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw exitError;
    }) as never);

    await expect(
      runAdd('https://github.com/owner/repo', {
        skill: ['agent-browser'],
      }),
    ).rejects.toBe(exitError);

    expect(baseDirModule.installManagedSkill).not.toHaveBeenCalled();
    expect(prompts.log.error).toHaveBeenCalledWith(
      t('managedSkillIdentityConflict', {
        skillPath: sourceSkill.skillPath,
      }),
    );
  });

  it('rejects an ambiguous non-interactive skill name', async () => {
    vi.mocked(sourceIntakeModule.withSource).mockImplementation(
      async (_input, consume) =>
        await consume({
          ...sourceSnapshot,
          skills: [
            { ...sourceSkill, name: 'duplicate', skillPath: 'a/SKILL.md' },
            { ...sourceSkill, name: 'Duplicate', skillPath: 'b/SKILL.md' },
          ],
        }),
    );
    const exitError = new Error('process.exit');
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw exitError;
    }) as never);

    await expect(runAdd('owner/repo', { skill: ['duplicate'] })).rejects.toBe(
      exitError,
    );

    expect(baseDirModule.installManagedSkill).not.toHaveBeenCalled();
    expect(prompts.log.error).toHaveBeenCalledWith(
      t('ambiguousSkillName', {
        name: 'duplicate',
        paths: 'a/SKILL.md, b/SKILL.md',
      }),
    );
  });

  afterEach(() => {
    if (originalIsTTY) {
      Object.defineProperty(process.stdout, 'isTTY', originalIsTTY);
    }
  });
});
