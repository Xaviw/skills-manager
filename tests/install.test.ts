import { mkdir as mkdirMock } from 'fs/promises';
import * as prompts from '@clack/prompts';
import { homedir } from 'os';
import { isAbsolute, resolve } from 'path';
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

import { stripAnsi } from '../src/test-utils.js';

import {
  applyEditableTargetDirectoryInput,
  buildActiveLine,
} from '../src/install.js';

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

vi.mock('../src/list-prompt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/list-prompt.js')>();
  return {
    ...actual,
    listPromptCancelSymbol: Symbol('list-prompt-cancel'),
    isListPromptCancel: vi.fn((value) => typeof value === 'symbol'),
    multiselectListPrompt: vi.fn(),
    selectListPrompt: vi.fn(),
  };
});

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

function expandExpectedHomeDirectory(targetDir: string): string {
  if (targetDir === '~') {
    return homedir();
  }

  if (targetDir.startsWith('~/') || targetDir.startsWith('~\\')) {
    return resolve(homedir(), targetDir.slice(2));
  }

  return targetDir;
}

function resolveExpectedTargetDir(targetDir: string): string {
  const expandedTargetDir = expandExpectedHomeDirectory(targetDir);
  return isAbsolute(expandedTargetDir)
    ? expandedTargetDir
    : resolve(process.cwd(), expandedTargetDir);
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
    const options = parseInstallOptions([
      '-s',
      'skill-one',
      'skill-two',
      '--all',
      '-d',
      './out',
      '--link',
    ]);
    expect(options).toEqual({
      skill: ['skill-one', 'skill-two'],
      all: true,
      dir: './out',
      link: true,
    });
  });

  it('exposes the built-in target directory shortcuts', () => {
    expect(INSTALL_TARGET_SHORTCUTS).toEqual([
      { value: '.agents/skills/', label: '.agents/skills/' },
      { value: '.claude/skills/', label: '.claude/skills/' },
    ]);
  });

  it('moves the editable target directory cursor and inserts at the caret', () => {
    let state = { value: 'abcd', cursorOffset: 4 };

    state = applyEditableTargetDirectoryInput(state, '', {
      name: 'left',
    } as never);
    state = applyEditableTargetDirectoryInput(state, '', {
      name: 'left',
    } as never);
    state = applyEditableTargetDirectoryInput(state, 'X', {
      name: 'x',
    } as never);

    expect(state).toEqual({ value: 'abXcd', cursorOffset: 3 });
  });

  it('deletes relative to the editable target directory caret', () => {
    const backspaced = applyEditableTargetDirectoryInput(
      { value: 'abcd', cursorOffset: 2 },
      '',
      { name: 'backspace' } as never,
    );
    const deleted = applyEditableTargetDirectoryInput(
      { value: 'abcd', cursorOffset: 2 },
      '',
      { name: 'delete' } as never,
    );

    expect(backspaced).toEqual({ value: 'acd', cursorOffset: 1 });
    expect(deleted).toEqual({ value: 'abd', cursorOffset: 2 });
  });

  it('renders the editable target directory caret at the cursor position', () => {
    const rendered = buildActiveLine('> ', { value: 'abcd' }, 20, 2);

    expect(stripAnsi(rendered.line)).toBe('> abcd');
    expect(rendered.cursorColumn).toBe(5);
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
      name: '--dir current directory',
      args: ['--dir', '.'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: true,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: '.',
    },
    {
      name: '--dir nested relative path without dot prefix',
      args: ['--dir', 'custom/skills'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: true,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: 'custom/skills',
    },
    {
      name: '--dir parent directory',
      args: ['--dir', '..'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: true,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: '..',
    },
    {
      name: '--dir home shortcut',
      args: ['--dir', '~/.claude/skills'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: true,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: '~/.claude/skills',
    },
    {
      name: '--dir home shortcut with backslashes',
      args: ['--dir', '~\\.claude\\skills'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: true,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: '~\\.claude\\skills',
    },
    {
      name: '--dir bare home shortcut',
      args: ['--dir', '~'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: true,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: '~',
    },
    {
      name: '--dir unsupported user home shorthand',
      args: ['--dir', '~other/skills'],
      expectSkillSelection: true,
      expectDirPrompt: false,
      expectModePrompt: true,
      expectedInstallCount: 1,
      expectedMode: 'copy',
      expectedTargetDir: '~other/skills',
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

  it.runIf(process.platform === 'win32')(
    'resolves Windows drive and UNC target directories',
    async () => {
      await runInstall({ dir: 'C:\\skills-target' });
      await runInstall({ dir: '\\\\server\\share\\skills' });

      expect(baseDir.installBaseSkillToProject).toHaveBeenNthCalledWith(
        1,
        'skill-one',
        'C:\\skills-target',
        'copy',
      );
      expect(baseDir.installBaseSkillToProject).toHaveBeenNthCalledWith(
        2,
        'skill-one',
        '\\\\server\\share\\skills',
        'copy',
      );
      expect(mkdirMock).toHaveBeenNthCalledWith(1, 'C:\\skills-target', {
        recursive: true,
      });
      expect(mkdirMock).toHaveBeenNthCalledWith(
        2,
        '\\\\server\\share\\skills',
        {
          recursive: true,
        },
      );
    },
  );

  it('skips interactive skill selection when named skills are provided', async () => {
    await runInstall(
      { skill: ['skill-two', 'skill-one', 'skill-two'] },
      {
        promptForTargetDir: vi.fn().mockResolvedValue('.agents/skills/'),
      },
    );

    expect(listPrompt.multiselectListPrompt).not.toHaveBeenCalled();
    expect(baseDir.installBaseSkillToProject).toHaveBeenNthCalledWith(
      1,
      'skill-two',
      resolveExpectedTargetDir('.agents/skills/'),
      'copy',
    );
    expect(baseDir.installBaseSkillToProject).toHaveBeenNthCalledWith(
      2,
      'skill-one',
      resolveExpectedTargetDir('.agents/skills/'),
      'copy',
    );
    expect(baseDir.installBaseSkillToProject).toHaveBeenCalledTimes(2);
  });

  it('exits with an error when a named skill does not exist', async () => {
    const exitMock = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit:${code ?? ''}`);
      });

    await expect(
      runInstall(
        { skill: ['missing-skill'] },
        {
          promptForTargetDir: vi.fn().mockResolvedValue('.agents/skills/'),
        },
      ),
    ).rejects.toThrow('process.exit:1');

    expect(prompts.log.error).toHaveBeenCalledWith(
      t('skillNotFound', { skillName: 'missing-skill' }),
    );
    expect(listPrompt.multiselectListPrompt).not.toHaveBeenCalled();
    expect(mkdirMock).not.toHaveBeenCalled();

    exitMock.mockRestore();
  });

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

  it('expands a prompted home shortcut but persists the original input', async () => {
    await runInstall(
      {},
      {
        promptForTargetDir: vi.fn().mockResolvedValue('~/.claude/skills'),
      },
    );

    expect(baseDir.installBaseSkillToProject).toHaveBeenCalledWith(
      'skill-one',
      resolveExpectedTargetDir('~/.claude/skills'),
      'copy',
    );
    expect(skillLock.addSavedTargetDirectory).toHaveBeenCalledWith(
      '~/.claude/skills',
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
