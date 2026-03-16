import { mkdir as mkdirMock } from 'fs/promises';
import * as prompts from '@clack/prompts';
import { resolve } from 'path';
import pc from 'picocolors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as baseDir from '../src/base-dir.js';
import { resolveCliLocale, t } from '../src/i18n.js';
import { INSTALL_TARGET_SHORTCUTS, parseInstallOptions, promptForTargetDir, runInstall } from '../src/install.js';

function withSelectHelp(message: string): string {
  return `${message} ${pc.dim(t('selectPromptHelp'))}`;
}

function withMultiselectHelp(message: string): string {
  return `${message} ${pc.dim(t('multiselectPromptHelp'))}`;
}

vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  multiselect: vi.fn(),
  text: vi.fn(),
  isCancel: vi.fn(() => false),
  cancel: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../src/base-dir.js', () => ({
  listBaseSkills: vi.fn(),
  installBaseSkillToProject: vi.fn(),
}));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: vi.fn(),
  };
});

function resolveExpectedTargetDir(targetDir: string): string {
  return targetDir.startsWith('.') ? resolve(process.cwd(), targetDir) : targetDir;
}

describe('install command helpers', () => {
  const locale = resolveCliLocale();
  const availableSkills = [
    { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    { directoryName: 'skill-two', managed: false, path: '/base/skill-two' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(baseDir.listBaseSkills).mockResolvedValue(availableSkills as never);
    vi.mocked(baseDir.installBaseSkillToProject).mockResolvedValue({ path: '/project/skill-one', linked: false } as never);
    vi.mocked(mkdirMock).mockResolvedValue(undefined);
    vi.mocked(prompts.multiselect).mockResolvedValue(['skill-one']);
    vi.mocked(prompts.select).mockImplementation(async (options) => {
      if (options.message === withSelectHelp(t('targetDirectory'))) {
        return '.agents/skills/';
      }
      if (options.message === withSelectHelp(t('installationMode'))) {
        return 'copy';
      }
      return '.agents/skills/';
    });
    vi.mocked(prompts.text).mockResolvedValue('./custom/skills');
  });

  it('parses install flags and aliases', () => {
    const options = parseInstallOptions(['--all', '-d', './out', '--link']);
    expect(options).toEqual({ all: true, dir: './out', link: true });
  });

  it('exposes the built-in target directory shortcuts', () => {
    expect(INSTALL_TARGET_SHORTCUTS).toEqual([
      { value: '.agents/skills/', label: '.agents/skills/' },
      { value: '.claude/skills/', label: '.claude/skills/' },
      { value: '__custom__', label: t('customPathLabel', {}, locale) },
    ]);
  });

  it('returns the selected shortcut directory without asking for custom input', async () => {
    const select = vi.fn().mockResolvedValue('.agents/skills/');
    const text = vi.fn();

    const result = await promptForTargetDir(select as never, text as never);

    expect(result).toBe('.agents/skills/');
    expect(text).not.toHaveBeenCalled();
  });

  it('prompts for a custom directory after selecting the custom option', async () => {
    const select = vi.fn().mockResolvedValue('__custom__');
    const text = vi.fn().mockResolvedValue('./custom/skills');

    const result = await promptForTargetDir(select as never, text as never);

    expect(result).toBe('./custom/skills');
    expect(text).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'no flags',
      args: [],
      expectSkillSelection: true,
      expectDirPrompt: true,
      expectModePrompt: true,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: '.agents/skills/',
    },
    {
      name: '--copy',
      args: ['--copy'],
      expectSkillSelection: true,
      expectDirPrompt: true,
      expectModePrompt: false,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: '.agents/skills/',
    },
    {
      name: '--link',
      args: ['--link'],
      expectSkillSelection: true,
      expectDirPrompt: true,
      expectModePrompt: false,
      expectedInstallCount: 1,
      expectedMode: 'link',
      expectedTargetDir: '.agents/skills/',
    },
    {
      name: '--dir',
      args: ['--dir', './out'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: true,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: './out',
    },
    {
      name: '--dir --copy',
      args: ['--dir', './out', '--copy'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: false,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: './out',
    },
    {
      name: '--dir --link',
      args: ['--dir', './out', '--link'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: false,
      expectedInstallCount: 1,
      expectedMode: 'link',
      expectedTargetDir: './out',
    },
    {
      name: '--all',
      args: ['--all'],
      expectSkillSelection: false,
      expectDirPrompt: true,
      expectModePrompt: true,
      expectedInstallCount: 2,
      expectedMode: 'copy',
      expectedTargetDir: '.agents/skills/',
    },
    {
      name: '--all --copy',
      args: ['--all', '--copy'],
      expectSkillSelection: false,
      expectDirPrompt: true,
      expectModePrompt: false,
      expectedInstallCount: 2,
      expectedMode: 'copy',
      expectedTargetDir: '.agents/skills/',
    },
    {
      name: '--all --link',
      args: ['--all', '--link'],
      expectSkillSelection: false,
      expectDirPrompt: true,
      expectModePrompt: false,
      expectedInstallCount: 2,
      expectedMode: 'link',
      expectedTargetDir: '.agents/skills/',
    },
    {
      name: '--all --dir',
      args: ['--all', '--dir', './out'],
      expectSkillSelection: false,
      expectDirPrompt: false,
      expectModePrompt: true,
      expectedInstallCount: 2,
      expectedMode: 'copy',
      expectedTargetDir: './out',
    },
    {
      name: '--all --dir --copy',
      args: ['--all', '--dir', './out', '--copy'],
      expectSkillSelection: false,
      expectDirPrompt: false,
      expectModePrompt: false,
      expectedInstallCount: 2,
      expectedMode: 'copy',
      expectedTargetDir: './out',
    },
    {
      name: '--all --dir --link',
      args: ['--all', '--dir', './out', '--link'],
      expectSkillSelection: false,
      expectDirPrompt: false,
      expectModePrompt: false,
      expectedInstallCount: 2,
      expectedMode: 'link',
      expectedTargetDir: './out',
    },
  ])('covers install interaction flow for $name', async ({
    args,
    expectSkillSelection,
    expectDirPrompt,
    expectModePrompt,
    expectedInstallCount,
    expectedMode,
    expectedTargetDir,
  }) => {
    const options = parseInstallOptions(args);

    await runInstall(options);

    expect(prompts.multiselect).toHaveBeenCalledTimes(expectSkillSelection ? 1 : 0);

    const selectMessages = vi.mocked(prompts.select).mock.calls.map(([call]) => call.message);
    expect(selectMessages.includes(withSelectHelp(t('targetDirectory')))).toBe(expectDirPrompt);
    expect(selectMessages.includes(withSelectHelp(t('installationMode')))).toBe(expectModePrompt);

    const multiselectMessages = vi.mocked(prompts.multiselect).mock.calls.map(([call]) => call.message);
    expect(multiselectMessages.includes(withMultiselectHelp(t('selectSkillsToInstallIntoProject')))).toBe(
      expectSkillSelection
    );

    expect(baseDir.installBaseSkillToProject).toHaveBeenCalledTimes(expectedInstallCount);
    for (const call of vi.mocked(baseDir.installBaseSkillToProject).mock.calls) {
      expect(call[1]).toBe(resolveExpectedTargetDir(expectedTargetDir));
      expect(call[2]).toBe(expectedMode);
    }

    expect(mkdirMock).toHaveBeenCalledWith(resolveExpectedTargetDir(expectedTargetDir), { recursive: true });
  });
});


