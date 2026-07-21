import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as baseDir from '../src/base-dir.js';
import * as github from '../src/github.js';
import * as prompt from '../src/prompt.js';
import * as sourceIntake from '../src/source-intake.js';
import { runUpdate } from '../src/update.js';
import type { BaseSkillInfo, ManagedSkillLockEntry } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  log: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../src/base-dir.js', () => ({
  listBaseSkills: vi.fn(),
  installManagedSkill: vi.fn(),
}));

vi.mock('../src/github.js', () => ({
  fetchSkillFolderHashes: vi.fn(async () => ({})),
  getGitHubToken: vi.fn(() => null),
}));

vi.mock('../src/prompt.js', () => ({
  isPromptCancel: vi.fn(() => false),
  multiselectPrompt: vi.fn(),
}));

vi.mock('../src/source-intake.js', () => ({
  withSource: vi.fn(),
}));

describe('update source intake orchestration', () => {
  const sourceDir = join(process.cwd(), 'source');

  beforeEach(() => {
    const entry = (name: string): ManagedSkillLockEntry => ({
      displayName: name,
      source: sourceDir,
      sourceType: 'local',
      sourceUrl: sourceDir,
      skillPath: `${name}/SKILL.md`,
      skillFolderHash: '',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue(
      ['one', 'two'].map(
        (name): BaseSkillInfo => ({
          directoryName: name,
          managed: true,
          lockEntry: entry(name),
          path: join(process.cwd(), 'base', name),
        }),
      ),
    );
    vi.mocked(baseDir.installManagedSkill).mockResolvedValue();
    vi.mocked(sourceIntake.withSource).mockImplementation(
      async (_input, consume) =>
        await consume({
          source: { kind: 'local', localPath: sourceDir },
          skills: ['one', 'two'].map((name) => ({
            name,
            description: name,
            path: join(sourceDir, name),
            skillPath: `${name}/SKILL.md`,
          })),
          issues: [],
        }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('opens one source scope and commits each requested skill', async () => {
    await runUpdate({
      skillNames: ['one', 'two'],
      shouldRenderProgress: false,
    });

    expect(sourceIntake.withSource).toHaveBeenCalledTimes(1);
    expect(baseDir.installManagedSkill).toHaveBeenCalledTimes(2);
  });

  it('repairs a missing skillPath during an automatic update', async () => {
    const lockEntry: ManagedSkillLockEntry = {
      displayName: 'ONE',
      source: sourceDir,
      sourceType: 'local',
      sourceUrl: sourceDir,
      skillFolderHash: '',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'existing-one',
        managed: true,
        lockEntry,
        path: join(process.cwd(), 'base', 'existing-one'),
      },
    ]);

    await runUpdate({ isInteractive: false, shouldRenderProgress: false });

    expect(baseDir.installManagedSkill).toHaveBeenCalledWith(
      join(sourceDir, 'one'),
      'existing-one',
      expect.objectContaining({
        displayName: 'one',
        skillPath: 'one/SKILL.md',
      }),
    );
  });

  it('records the current GitHub hash after repairing a skillPath', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'existing-one',
        managed: true,
        path: join(process.cwd(), 'base', 'existing-one'),
        lockEntry: {
          displayName: 'one',
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo.git',
          sourceRef: 'release',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);
    vi.mocked(github.fetchSkillFolderHashes).mockResolvedValue({
      'one/SKILL.md': 'new-hash',
    });

    await runUpdate({ isInteractive: false, shouldRenderProgress: false });

    expect(github.fetchSkillFolderHashes).toHaveBeenCalledWith(
      'owner/repo',
      ['one/SKILL.md'],
      null,
      'release',
    );
    expect(baseDir.installManagedSkill).toHaveBeenCalledWith(
      expect.any(String),
      'existing-one',
      expect.objectContaining({
        skillPath: 'one/SKILL.md',
        skillFolderHash: 'new-hash',
      }),
    );
  });

  it('recognizes a historical git entry with a GitHub URL during repair', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'existing-one',
        managed: true,
        path: join(process.cwd(), 'base', 'existing-one'),
        lockEntry: {
          displayName: 'one',
          source: 'https://github.com/Owner/Repo.git',
          sourceType: 'git',
          sourceUrl: 'git@github.com:Owner/Repo.git',
          sourceRef: 'release',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);
    vi.mocked(github.fetchSkillFolderHashes).mockResolvedValue({
      'one/SKILL.md': 'new-hash',
    });

    await runUpdate({ isInteractive: false, shouldRenderProgress: false });

    expect(github.fetchSkillFolderHashes).toHaveBeenCalledWith(
      'owner/repo',
      ['one/SKILL.md'],
      null,
      'release',
    );
    expect(baseDir.installManagedSkill).toHaveBeenCalledWith(
      expect.any(String),
      'existing-one',
      expect.objectContaining({ skillFolderHash: 'new-hash' }),
    );
  });

  it('does not use GitHub hash tracking for an ordinary Git source', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'one',
        managed: true,
        path: join(process.cwd(), 'base', 'one'),
        lockEntry: {
          displayName: 'one',
          source: 'ssh://git@gitlab.com/owner/repo.git',
          sourceType: 'git',
          sourceUrl: 'ssh://git@gitlab.com/owner/repo.git',
          skillPath: 'one/SKILL.md',
          skillFolderHash: 'old-hash',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);

    await runUpdate({ isInteractive: false, shouldRenderProgress: false });

    expect(github.fetchSkillFolderHashes).not.toHaveBeenCalled();
    expect(sourceIntake.withSource).not.toHaveBeenCalled();
    expect(baseDir.installManagedSkill).not.toHaveBeenCalled();
  });

  it('still reinstalls an explicitly requested ordinary Git skill', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'one',
        managed: true,
        path: join(process.cwd(), 'base', 'one'),
        lockEntry: {
          displayName: 'one',
          source: 'ssh://git@gitlab.com/owner/repo.git',
          sourceType: 'git',
          sourceUrl: 'ssh://git@gitlab.com/owner/repo.git',
          skillPath: 'one/SKILL.md',
          skillFolderHash: 'old-hash',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);

    await runUpdate({
      skillNames: ['one'],
      shouldRenderProgress: false,
    });

    expect(sourceIntake.withSource).toHaveBeenCalledWith(
      {
        kind: 'git',
        url: 'ssh://git@gitlab.com/owner/repo.git',
        ref: undefined,
        githubRepo: undefined,
      },
      expect.any(Function),
    );
    expect(github.fetchSkillFolderHashes).not.toHaveBeenCalled();
    expect(baseDir.installManagedSkill).toHaveBeenCalledTimes(1);
  });

  it('repairs a missing skillPath from an ordinary Git source', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'one',
        managed: true,
        path: join(process.cwd(), 'base', 'one'),
        lockEntry: {
          displayName: 'one',
          source: 'ssh://git@gitlab.com/owner/repo.git',
          sourceType: 'git',
          sourceUrl: 'ssh://git@gitlab.com/owner/repo.git',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);

    await runUpdate({ isInteractive: false, shouldRenderProgress: false });

    expect(github.fetchSkillFolderHashes).not.toHaveBeenCalled();
    expect(baseDir.installManagedSkill).toHaveBeenCalledWith(
      expect.any(String),
      'one',
      expect.objectContaining({
        skillPath: 'one/SKILL.md',
        skillFolderHash: '',
      }),
    );
  });

  it('repairs only interactively selected legacy entries', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue(
      ['one', 'two'].map((name) => ({
        directoryName: name,
        managed: true,
        path: join(process.cwd(), 'base', name),
        lockEntry: {
          displayName: name,
          source: sourceDir,
          sourceType: 'local' as const,
          sourceUrl: sourceDir,
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      })),
    );
    vi.mocked(prompt.multiselectPrompt).mockResolvedValue(['two']);

    await runUpdate({ isInteractive: true, shouldRenderProgress: false });

    expect(prompt.multiselectPrompt).toHaveBeenCalledTimes(1);
    expect(baseDir.installManagedSkill).toHaveBeenCalledTimes(1);
    expect(baseDir.installManagedSkill).toHaveBeenCalledWith(
      expect.any(String),
      'two',
      expect.objectContaining({ skillPath: 'two/SKILL.md' }),
    );
  });

  it('reports an explicit repair failure without overwriting the entry', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'one',
        managed: true,
        path: join(process.cwd(), 'base', 'one'),
        lockEntry: {
          displayName: 'missing',
          source: sourceDir,
          sourceType: 'local',
          sourceUrl: sourceDir,
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);

    await runUpdate({ skillNames: ['one'], shouldRenderProgress: false });

    expect(baseDir.installManagedSkill).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('continues a repair batch after one entry cannot be matched', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue(
      ['one', 'missing'].map((name) => ({
        directoryName: name,
        managed: true,
        path: join(process.cwd(), 'base', name),
        lockEntry: {
          displayName: name,
          source: sourceDir,
          sourceType: 'local' as const,
          sourceUrl: sourceDir,
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      })),
    );

    await runUpdate({ isInteractive: false, shouldRenderProgress: false });

    expect(baseDir.installManagedSkill).toHaveBeenCalledTimes(1);
    expect(baseDir.installManagedSkill).toHaveBeenCalledWith(
      expect.any(String),
      'one',
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it.each([
    { skills: [], expectedReason: 'couldNotLocateSkillInSource' },
    {
      skills: [
        {
          name: 'one',
          description: 'one',
          path: join(sourceDir, 'a'),
          skillPath: 'a/SKILL.md',
        },
        {
          name: 'ONE',
          description: 'one',
          path: join(sourceDir, 'b'),
          skillPath: 'b/SKILL.md',
        },
      ],
      expectedReason: 'ambiguousSkillName',
    },
  ])(
    'does not guess a missing skillPath with $expectedReason',
    async ({ skills }) => {
      const lockEntry: ManagedSkillLockEntry = {
        displayName: 'one',
        source: sourceDir,
        sourceType: 'local',
        sourceUrl: sourceDir,
        skillFolderHash: '',
        installedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
        {
          directoryName: 'existing-one',
          managed: true,
          lockEntry,
          path: join(process.cwd(), 'base', 'existing-one'),
        },
      ]);
      vi.mocked(sourceIntake.withSource).mockImplementation(
        async (_input, consume) =>
          await consume({
            source: { kind: 'local', localPath: sourceDir },
            skills,
            issues: [],
          }),
      );

      await runUpdate({ isInteractive: false, shouldRenderProgress: false });

      expect(baseDir.installManagedSkill).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    },
  );
});
