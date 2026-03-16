import * as prompts from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pc from 'picocolors';
import * as baseDir from '../src/base-dir.js';
import { t } from '../src/i18n.js';
import * as listPrompt from '../src/list-prompt.js';
import { runRemove } from '../src/remove.js';

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  log: {
    error: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../src/list-prompt.js', () => ({
  listPromptCancelSymbol: Symbol('list-prompt-cancel'),
  isListPromptCancel: vi.fn((value) => typeof value === 'symbol'),
  multiselectListPrompt: vi.fn(),
  selectListPrompt: vi.fn(),
}));

vi.mock('../src/base-dir.js', () => ({
  listBaseSkills: vi.fn(),
  removeBaseSkill: vi.fn(),
}));

describe('remove command', () => {
  const exitError = new Error('process.exit');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
      throw Object.assign(exitError, { code });
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes a named skill without prompting', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    ] as never);

    await runRemove(['skill-one']);

    expect(listPrompt.multiselectListPrompt).not.toHaveBeenCalled();
    expect(baseDir.removeBaseSkill).toHaveBeenCalledTimes(1);
    expect(baseDir.removeBaseSkill).toHaveBeenCalledWith('skill-one');
    expect(prompts.log.success).toHaveBeenCalledWith(t('removedSkill', { skillName: 'skill-one' }));
  });

  it('removes multiple named skills without prompting', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
      { directoryName: 'skill-two', managed: false, path: '/base/skill-two' },
    ] as never);

    await runRemove(['skill-one', 'skill-two']);

    expect(listPrompt.multiselectListPrompt).not.toHaveBeenCalled();
    expect(baseDir.removeBaseSkill).toHaveBeenCalledTimes(2);
    expect(baseDir.removeBaseSkill).toHaveBeenNthCalledWith(1, 'skill-one');
    expect(baseDir.removeBaseSkill).toHaveBeenNthCalledWith(2, 'skill-two');
    expect(prompts.log.success).toHaveBeenCalledWith(t('removedSkills', { count: 2 }));
  });

  it('opens a multiselect with no default selection when no name is provided', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
      { directoryName: 'skill-two', managed: false, path: '/base/skill-two' },
    ] as never);
    vi.mocked(listPrompt.multiselectListPrompt).mockResolvedValue(['skill-one', 'skill-two']);

    await runRemove();

    expect(prompts.log.message).toHaveBeenCalledWith(pc.dim(t('multiselectPromptHelp')));
    expect(listPrompt.multiselectListPrompt).toHaveBeenCalledWith({
      message: t('selectSkillsToRemove'),
      options: [
        { value: 'skill-one', label: 'skill-one' },
        { value: 'skill-two', label: 'skill-two' },
      ],
      required: true,
    });
    expect(baseDir.removeBaseSkill).toHaveBeenCalledTimes(2);
    expect(baseDir.removeBaseSkill).toHaveBeenNthCalledWith(1, 'skill-one');
    expect(baseDir.removeBaseSkill).toHaveBeenNthCalledWith(2, 'skill-two');
    expect(prompts.log.success).toHaveBeenCalledWith(t('removedSkills', { count: 2 }));
  });

  it('stops when the interactive removal is cancelled', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    ] as never);
    vi.mocked(listPrompt.multiselectListPrompt).mockResolvedValue(listPrompt.listPromptCancelSymbol as never);
    vi.mocked(listPrompt.isListPromptCancel).mockReturnValue(true);

    await runRemove();

    expect(baseDir.removeBaseSkill).not.toHaveBeenCalled();
    expect(prompts.cancel).toHaveBeenCalledWith(t('removalCancelled'));
  });

  it('exits with an error when the named skill does not exist', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    ] as never);

    await expect(runRemove(['missing-skill'])).rejects.toMatchObject({ code: 1 });
    expect(prompts.log.error).toHaveBeenCalledWith(t('skillNotFound', { skillName: 'missing-skill' }));
  });

  it('exits with an error and removes nothing when any named skill does not exist', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    ] as never);

    await expect(runRemove(['skill-one', 'missing-skill'])).rejects.toMatchObject({ code: 1 });
    expect(baseDir.removeBaseSkill).not.toHaveBeenCalled();
    expect(prompts.log.error).toHaveBeenCalledWith(t('skillNotFound', { skillName: 'missing-skill' }));
  });

  it('exits with an error when there are no skills to remove interactively', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([] as never);

    await expect(runRemove()).rejects.toMatchObject({ code: 1 });
    expect(prompts.log.error).toHaveBeenCalledWith(t('noSkillsAvailableInBaseDir'));
  });
});
