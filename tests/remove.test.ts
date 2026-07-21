import * as prompts from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as baseDir from '../src/base-dir.js';
import { t } from '../src/i18n.js';
import * as prompt from '../src/prompt.js';
import { runRemove } from '../src/remove.js';

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  log: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../src/prompt.js', () => ({
  isPromptCancel: vi.fn(() => false),
  multiselectPrompt: vi.fn(),
  selectPrompt: vi.fn(),
  textPrompt: vi.fn(),
}));

vi.mock('../src/base-dir.js', () => ({
  listBaseSkills: vi.fn(),
  removeBaseSkill: vi.fn(),
}));

describe('remove command', () => {
  const exitError = new Error('process.exit');
  let originalInputIsTTY: PropertyDescriptor | undefined;
  let originalOutputIsTTY: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalInputIsTTY = Object.getOwnPropertyDescriptor(
      process.stdin,
      'isTTY',
    );
    originalOutputIsTTY = Object.getOwnPropertyDescriptor(
      process.stdout,
      'isTTY',
    );
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null | undefined,
    ) => {
      throw Object.assign(exitError, { code });
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalInputIsTTY) {
      Object.defineProperty(process.stdin, 'isTTY', originalInputIsTTY);
    } else {
      Reflect.deleteProperty(process.stdin, 'isTTY');
    }
    if (originalOutputIsTTY) {
      Object.defineProperty(process.stdout, 'isTTY', originalOutputIsTTY);
    } else {
      Reflect.deleteProperty(process.stdout, 'isTTY');
    }
  });

  it('removes a named skill without prompting', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    ] as never);

    await runRemove(['skill-one']);

    expect(prompt.multiselectPrompt).not.toHaveBeenCalled();
    expect(baseDir.removeBaseSkill).toHaveBeenCalledTimes(1);
    expect(baseDir.removeBaseSkill).toHaveBeenCalledWith('skill-one');
    expect(prompts.log.success).toHaveBeenCalledWith(
      t('removedSkill', { skillName: 'skill-one' }),
    );
  });

  it('removes multiple named skills without prompting', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'skill-one',
        managed: true,
        path: '/base/skill-one',
        lockEntry: {
          displayName: 'skill-one',
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/Owner/Repo.git',
          skillPath: 'skill-one/SKILL.md',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      { directoryName: 'skill-two', managed: false, path: '/base/skill-two' },
    ] as never);

    await runRemove(['skill-one', 'skill-two']);

    expect(prompt.multiselectPrompt).not.toHaveBeenCalled();
    expect(baseDir.removeBaseSkill).toHaveBeenCalledTimes(2);
    expect(baseDir.removeBaseSkill).toHaveBeenNthCalledWith(1, 'skill-one');
    expect(baseDir.removeBaseSkill).toHaveBeenNthCalledWith(2, 'skill-two');
    expect(prompts.log.success).toHaveBeenCalledWith(
      t('removedSkills', { count: 2 }),
    );
  });

  it('opens a multiselect with no default selection when no name is provided', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      {
        directoryName: 'skill-one',
        managed: true,
        path: '/base/skill-one',
        lockEntry: {
          displayName: 'skill-one',
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/Owner/Repo.git',
          skillPath: 'skill-one/SKILL.md',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      { directoryName: 'skill-two', managed: false, path: '/base/skill-two' },
    ] as never);
    vi.mocked(prompt.multiselectPrompt).mockResolvedValue([
      'skill-one',
      'skill-two',
    ]);

    await runRemove();

    expect(prompt.multiselectPrompt).toHaveBeenCalledWith({
      message: t('selectSkillsToRemove'),
      options: [
        { value: 'skill-two', label: 'skill-two', group: t('manualSkills') },
        { value: 'skill-one', label: 'skill-one', group: 'owner/repo' },
      ],
    });
    expect(baseDir.removeBaseSkill).toHaveBeenCalledTimes(2);
    expect(baseDir.removeBaseSkill).toHaveBeenNthCalledWith(1, 'skill-one');
    expect(baseDir.removeBaseSkill).toHaveBeenNthCalledWith(2, 'skill-two');
    expect(prompts.log.success).toHaveBeenCalledWith(
      t('removedSkills', { count: 2 }),
    );
  });

  it('stops when the interactive removal is cancelled', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    ] as never);
    vi.mocked(prompt.multiselectPrompt).mockResolvedValue(
      Symbol('cancel') as prompt.PromptCancel,
    );
    vi.mocked(prompt.isPromptCancel).mockReturnValue(true);

    await runRemove();

    expect(baseDir.removeBaseSkill).not.toHaveBeenCalled();
    expect(prompts.cancel).toHaveBeenCalledWith(t('removalCancelled'));
  });

  it('exits with an error when the named skill does not exist', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    ] as never);

    await expect(runRemove(['missing-skill'])).rejects.toMatchObject({
      code: 1,
    });
    expect(prompts.log.error).toHaveBeenCalledWith(
      t('skillNotFound', { skillName: 'missing-skill' }),
    );
  });

  it('exits with an error and removes nothing when any named skill does not exist', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    ] as never);

    await expect(
      runRemove(['skill-one', 'missing-skill']),
    ).rejects.toMatchObject({ code: 1 });
    expect(baseDir.removeBaseSkill).not.toHaveBeenCalled();
    expect(prompts.log.error).toHaveBeenCalledWith(
      t('skillNotFound', { skillName: 'missing-skill' }),
    );
  });

  it('exits with an error when there are no skills to remove interactively', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([] as never);

    await expect(runRemove()).rejects.toMatchObject({ code: 1 });
    expect(prompts.log.error).toHaveBeenCalledWith(
      t('noSkillsAvailableInBaseDir'),
    );
  });
});
