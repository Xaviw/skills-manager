import { mkdir as mkdirMock } from 'fs/promises';
import * as prompts from '@clack/prompts';
import { resolve } from 'path';
import pc from 'picocolors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as baseDir from '../src/base-dir.js';
import { t } from '../src/i18n.js';
import {
  INSTALL_TARGET_SHORTCUTS,
  parseInstallOptions,
  promptForTargetDir,
  runInstall,
} from '../src/install.js';
import * as listPrompt from '../src/list-prompt.js';
import * as skillLock from '../src/skill-lock.js';

function dimmedSelectHelp(): string {
  return `${pc.dim(t('selectPromptHelp'))}\n`;
}

function dimmedMultiselectHelp(): string {
  return `${pc.dim(t('multiselectPromptHelp'))}\n`;
}

function dimmedTargetDirectoryHelp(): string {
  return `${pc.dim(t('targetDirectoryPromptHelp'))}\n`;
}

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  isCancel: vi.fn(() => false),
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
  installBaseSkillToProject: vi.fn(),
}));

vi.mock('../src/skill-lock.js', () => ({
  readSavedTargetDirectories: vi.fn(),
  addSavedTargetDirectory: vi.fn(),
}));

vi.mock('fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: vi.fn(),
  };
});

function resolveExpectedTargetDir(targetDir: string): string {
  return targetDir.startsWith('.')
    ? resolve(process.cwd(), targetDir)
    : targetDir;
}

describe('install command helpers', () => {
  const availableSkills = [
    { directoryName: 'skill-one', managed: true, path: '/base/skill-one' },
    { directoryName: 'skill-two', managed: false, path: '/base/skill-two' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(baseDir.listBaseSkills).mockResolvedValue(
      availableSkills as never,
    );
    vi.mocked(baseDir.installBaseSkillToProject).mockResolvedValue({
      path: '/project/skill-one',
      linked: false,
    } as never);
    vi.mocked(skillLock.readSavedTargetDirectories).mockResolvedValue([]);
    vi.mocked(skillLock.addSavedTargetDirectory).mockResolvedValue(undefined);
    vi.mocked(mkdirMock).mockResolvedValue(undefined);
    vi.mocked(listPrompt.multiselectListPrompt).mockResolvedValue([
      'skill-one',
    ]);
    vi.mocked(listPrompt.selectListPrompt).mockImplementation(
      async (options) => {
        if (options.message === t('installationMode')) {
          return 'copy';
        }
        return '.agents/skills/';
      },
    );
  });

  it('parses install flags and aliases', () => {
    const options = parseInstallOptions(['--all', '-d', './out', '--link']);
    expect(options).toEqual({ all: true, dir: './out', link: true });
  });

  it('exposes the built-in target directory shortcuts', () => {
    expect(INSTALL_TARGET_SHORTCUTS).toEqual([
      { value: '.agents/skills/', label: '.agents/skills/' },
      { value: '.claude/skills/', label: '.claude/skills/' },
    ]);
  });

  it('returns the selected directory from the editable prompt', async () => {
    const prompt = vi.fn().mockResolvedValue('.agents/skills/');

    const result = await promptForTargetDir({
      promptTargetDir: prompt as never,
    });

    expect(result).toBe('.agents/skills/');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith({
      message: t('targetDirectory'),
      entries: [
        { value: '.agents/skills/' },
        { value: '.claude/skills/' },
        { value: '', placeholder: t('customPathLabel') },
      ],
    });
  });

  it('supports returning a custom directory value from the editable prompt', async () => {
    const prompt = vi.fn().mockResolvedValue('./custom/skills');

    const result = await promptForTargetDir({
      promptTargetDir: prompt as never,
    });

    expect(result).toBe('./custom/skills');
  });

  it('adds saved custom target directories to the editable prompt options', async () => {
    vi.mocked(skillLock.readSavedTargetDirectories).mockResolvedValue([
      './shared/skills',
      '/tmp/custom-skills',
      '.agents/skills/',
    ]);
    const prompt = vi.fn().mockResolvedValue('./shared/skills');

    await promptForTargetDir({
      promptTargetDir: prompt as never,
    });

    expect(prompt).toHaveBeenCalledWith({
      message: t('targetDirectory'),
      entries: [
        { value: '.agents/skills/' },
        { value: '.claude/skills/' },
        { value: './shared/skills' },
        { value: '/tmp/custom-skills' },
        { value: '', placeholder: t('customPathLabel') },
      ],
    });
  });

  it('returns cancel when the editable target directory prompt is cancelled', async () => {
    const prompt = vi.fn().mockResolvedValue(listPrompt.listPromptCancelSymbol);

    const result = await promptForTargetDir({
      promptTargetDir: prompt as never,
    });

    expect(result).toBe(listPrompt.listPromptCancelSymbol);
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
  ])(
    'covers install interaction flow for $name',
    async ({
      args,
      expectSkillSelection,
      expectDirPrompt,
      expectModePrompt,
      expectedInstallCount,
      expectedMode,
      expectedTargetDir,
    }) => {
      const options = parseInstallOptions(args);
      const promptTargetDir = vi.fn().mockResolvedValue('.agents/skills/');

      await runInstall(options, { promptForTargetDir: promptTargetDir });

      expect(listPrompt.multiselectListPrompt).toHaveBeenCalledTimes(
        expectSkillSelection ? 1 : 0,
      );
      expect(promptTargetDir).toHaveBeenCalledTimes(expectDirPrompt ? 1 : 0);

      const selectMessages = vi
        .mocked(listPrompt.selectListPrompt)
        .mock.calls.map(([call]) => call.message);
      expect(selectMessages.includes(t('installationMode'))).toBe(
        expectModePrompt,
      );

      const multiselectMessages = vi
        .mocked(listPrompt.multiselectListPrompt)
        .mock.calls.map(([call]) => call.message);
      expect(
        multiselectMessages.includes(t('selectSkillsToInstallIntoProject')),
      ).toBe(expectSkillSelection);

      const helpMessages = vi
        .mocked(prompts.log.message)
        .mock.calls.map(([message]) => message);
      const selectHelpCount = expectModePrompt ? 1 : 0;
      const multiselectHelpCount = expectSkillSelection ? 1 : 0;
      const targetDirectoryHelpCount = expectDirPrompt ? 1 : 0;
      expect(
        helpMessages.filter((message) => message === dimmedSelectHelp()),
      ).toHaveLength(selectHelpCount);
      expect(
        helpMessages.filter((message) => message === dimmedMultiselectHelp()),
      ).toHaveLength(multiselectHelpCount);
      expect(
        helpMessages.filter(
          (message) => message === dimmedTargetDirectoryHelp(),
        ),
      ).toHaveLength(targetDirectoryHelpCount);

      expect(baseDir.installBaseSkillToProject).toHaveBeenCalledTimes(
        expectedInstallCount,
      );
      for (const call of vi.mocked(baseDir.installBaseSkillToProject).mock
        .calls) {
        expect(call[1]).toBe(resolveExpectedTargetDir(expectedTargetDir));
        expect(call[2]).toBe(expectedMode);
      }

      expect(mkdirMock).toHaveBeenCalledWith(
        resolveExpectedTargetDir(expectedTargetDir),
        { recursive: true },
      );
    },
  );

  it('cancels install when target directory selection is cancelled', async () => {
    const exitMock = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit:${code ?? ''}`);
      });

    vi.mocked(listPrompt.multiselectListPrompt).mockResolvedValue([
      'skill-one',
    ]);

    await expect(
      runInstall(
        {},
        {
          promptForTargetDir: vi
            .fn()
            .mockResolvedValue(listPrompt.listPromptCancelSymbol) as never,
        },
      ),
    ).rejects.toThrow('process.exit:0');
    expect(prompts.cancel).toHaveBeenCalledWith(t('installationCancelled'));
    expect(mkdirMock).not.toHaveBeenCalled();

    exitMock.mockRestore();
  });

  it('records the prompted custom target directory after install', async () => {
    await runInstall(
      {},
      {
        promptForTargetDir: vi.fn().mockResolvedValue('./custom/skills'),
      },
    );

    expect(skillLock.addSavedTargetDirectory).toHaveBeenCalledTimes(1);
    expect(skillLock.addSavedTargetDirectory).toHaveBeenCalledWith(
      './custom/skills',
    );
  });

  it('ignores target directory persistence failures after a successful install', async () => {
    await expect(
      runInstall(
        {},
        {
          promptForTargetDir: vi.fn().mockResolvedValue('./custom/skills'),
          saveTargetDirectory: vi.fn().mockRejectedValue(new Error('boom')),
        },
      ),
    ).resolves.toBeUndefined();

    expect(baseDir.installBaseSkillToProject).toHaveBeenCalledTimes(1);
    expect(prompts.log.success).toHaveBeenCalledWith(
      t('installedSkillsIntoTargetDir', {
        count: 1,
        targetDir: resolveExpectedTargetDir('./custom/skills'),
        linkSuffix: '',
      }),
    );
  });

  it('does not record built-in or flag-provided target directories', async () => {
    await runInstall(
      {},
      {
        promptForTargetDir: vi.fn().mockResolvedValue('.agents/skills/'),
      },
    );
    await runInstall({ dir: './from-flag' });

    expect(skillLock.addSavedTargetDirectory).not.toHaveBeenCalled();
  });
});
