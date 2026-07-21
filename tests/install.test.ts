import { mkdir as mkdirMock } from 'fs/promises';
import * as prompts from '@clack/prompts';
import { homedir } from 'os';
import { isAbsolute, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as baseDir from '../src/base-dir.js';
import { t } from '../src/i18n.js';
import {
  INSTALL_TARGET_SHORTCUTS,
  parseInstallOptions,
  promptForTargetDir,
  runInstall,
} from '../src/install.js';
import * as projectInstall from '../src/project-install.js';
import * as prompt from '../src/prompt.js';
import * as skillLock from '../src/skill-lock.js';

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
}));

vi.mock('../src/project-install.js', () => ({
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

function chooseCustomTargetDirectory(value: string): void {
  vi.mocked(prompt.textPrompt).mockResolvedValue(value);
  vi.mocked(prompt.selectPrompt).mockImplementation(async (options) => {
    if (options.message === t('installationMode')) {
      return 'copy';
    }
    return options.options.find(
      (option) => option.label === t('customPathLabel'),
    )!.value;
  });
}

describe('install command helpers', () => {
  const availableSkills = [
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
  ];
  let originalInputIsTTY: PropertyDescriptor | undefined;
  let originalOutputIsTTY: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
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

    vi.mocked(baseDir.listBaseSkills).mockResolvedValue(
      availableSkills as never,
    );
    vi.mocked(projectInstall.installBaseSkillToProject).mockResolvedValue({
      path: '/project/skill-one',
      linked: false,
    } as never);
    vi.mocked(skillLock.readSavedTargetDirectories).mockResolvedValue([]);
    vi.mocked(skillLock.addSavedTargetDirectory).mockResolvedValue(undefined);
    vi.mocked(mkdirMock).mockResolvedValue(undefined);
    vi.mocked(prompt.isPromptCancel).mockReturnValue(false);
    vi.mocked(prompt.multiselectPrompt).mockResolvedValue(['skill-one']);
    vi.mocked(prompt.textPrompt).mockResolvedValue('./custom/skills');
    vi.mocked(prompt.selectPrompt).mockImplementation(async (options) => {
      if (options.message === t('installationMode')) {
        return 'copy';
      }
      return '.agents/skills/';
    });
  });

  afterEach(() => {
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

  it('returns the selected target directory shortcut', async () => {
    const result = await promptForTargetDir();

    expect(result).toBe('.agents/skills/');
    expect(prompt.selectPrompt).toHaveBeenCalledTimes(1);
    expect(prompt.selectPrompt).toHaveBeenCalledWith({
      message: t('targetDirectory'),
      options: [
        { value: '.agents/skills/', label: '.agents/skills/' },
        { value: '.claude/skills/', label: '.claude/skills/' },
        { value: expect.any(Object), label: t('customPathLabel') },
      ],
    });
  });

  it('prompts for text after selecting a custom target directory', async () => {
    vi.mocked(prompt.selectPrompt).mockImplementation(
      async (options) =>
        options.options.find((option) => option.label === t('customPathLabel'))!
          .value,
    );

    const result = await promptForTargetDir();

    expect(result).toBe('./custom/skills');
    expect(prompt.textPrompt).toHaveBeenCalledWith({
      message: t('targetDirectory'),
      placeholder: './custom/skills',
      validate: expect.any(Function),
    });
  });

  it('adds saved custom target directories to the target picker', async () => {
    vi.mocked(skillLock.readSavedTargetDirectories).mockResolvedValue([
      './shared/skills',
      '/tmp/custom-skills',
      '.agents/skills/',
    ]);
    await promptForTargetDir();

    expect(prompt.selectPrompt).toHaveBeenCalledWith({
      message: t('targetDirectory'),
      options: [
        { value: '.agents/skills/', label: '.agents/skills/' },
        { value: '.claude/skills/', label: '.claude/skills/' },
        { value: './shared/skills', label: './shared/skills' },
        { value: '/tmp/custom-skills', label: '/tmp/custom-skills' },
        { value: expect.any(Object), label: t('customPathLabel') },
      ],
    });
  });

  it('returns cancel when target directory selection is cancelled', async () => {
    const cancel = Symbol('cancel');
    vi.mocked(prompt.selectPrompt).mockResolvedValue(
      cancel as unknown as prompt.PromptCancel,
    );
    vi.mocked(prompt.isPromptCancel).mockReturnValue(true);

    const result = await promptForTargetDir();

    expect(result).toBe(cancel);
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
      await runInstall(options);

      expect(prompt.multiselectPrompt).toHaveBeenCalledTimes(
        expectSkillSelection ? 1 : 0,
      );

      const selectMessages = vi
        .mocked(prompt.selectPrompt)
        .mock.calls.map(([call]) => call.message);
      expect(selectMessages.includes(t('targetDirectory'))).toBe(
        expectDirPrompt,
      );
      expect(selectMessages.includes(t('installationMode'))).toBe(
        expectModePrompt,
      );

      const multiselectMessages = vi
        .mocked(prompt.multiselectPrompt)
        .mock.calls.map(([call]) => call.message);
      expect(
        multiselectMessages.includes(t('selectSkillsToInstallIntoProject')),
      ).toBe(expectSkillSelection);

      expect(projectInstall.installBaseSkillToProject).toHaveBeenCalledTimes(
        expectedInstallCount,
      );
      for (const call of vi.mocked(projectInstall.installBaseSkillToProject)
        .mock.calls) {
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

      expect(projectInstall.installBaseSkillToProject).toHaveBeenNthCalledWith(
        1,
        'skill-one',
        'C:\\skills-target',
        'copy',
      );
      expect(projectInstall.installBaseSkillToProject).toHaveBeenNthCalledWith(
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
    await runInstall({ skill: ['skill-two', 'skill-one', 'skill-two'] });

    expect(prompt.multiselectPrompt).not.toHaveBeenCalled();
    expect(projectInstall.installBaseSkillToProject).toHaveBeenNthCalledWith(
      1,
      'skill-two',
      resolveExpectedTargetDir('.agents/skills/'),
      'copy',
    );
    expect(projectInstall.installBaseSkillToProject).toHaveBeenNthCalledWith(
      2,
      'skill-one',
      resolveExpectedTargetDir('.agents/skills/'),
      'copy',
    );
    expect(projectInstall.installBaseSkillToProject).toHaveBeenCalledTimes(2);
  });

  it('groups interactive skills with manual skills first', async () => {
    await runInstall({});

    expect(prompt.multiselectPrompt).toHaveBeenCalledWith({
      message: t('selectSkillsToInstallIntoProject'),
      options: [
        { value: 'skill-two', label: 'skill-two', group: t('manualSkills') },
        { value: 'skill-one', label: 'skill-one', group: 'owner/repo' },
      ],
      initialValues: ['skill-two', 'skill-one'],
    });
  });

  it('exits with an error when a named skill does not exist', async () => {
    const exitMock = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit:${code ?? ''}`);
      });

    await expect(runInstall({ skill: ['missing-skill'] })).rejects.toThrow(
      'process.exit:1',
    );

    expect(prompts.log.error).toHaveBeenCalledWith(
      t('skillNotFound', { skillName: 'missing-skill' }),
    );
    expect(prompt.multiselectPrompt).not.toHaveBeenCalled();
    expect(mkdirMock).not.toHaveBeenCalled();

    exitMock.mockRestore();
  });

  it('cancels install when target directory selection is cancelled', async () => {
    const cancel = Symbol('cancel');
    vi.mocked(prompt.selectPrompt).mockResolvedValue(
      cancel as unknown as prompt.PromptCancel,
    );
    vi.mocked(prompt.isPromptCancel).mockReturnValue(true);

    await expect(runInstall({})).resolves.toBeUndefined();
    expect(prompts.cancel).toHaveBeenCalledWith(t('installationCancelled'));
    expect(mkdirMock).not.toHaveBeenCalled();
  });

  it('records the prompted custom target directory after install', async () => {
    chooseCustomTargetDirectory('./custom/skills');
    await runInstall({});

    expect(skillLock.addSavedTargetDirectory).toHaveBeenCalledTimes(1);
    expect(skillLock.addSavedTargetDirectory).toHaveBeenCalledWith(
      './custom/skills',
    );
  });

  it('expands a prompted home shortcut but persists the original input', async () => {
    chooseCustomTargetDirectory('~/.claude/skills');
    await runInstall({});

    expect(projectInstall.installBaseSkillToProject).toHaveBeenCalledWith(
      'skill-one',
      resolveExpectedTargetDir('~/.claude/skills'),
      'copy',
    );
    expect(skillLock.addSavedTargetDirectory).toHaveBeenCalledWith(
      '~/.claude/skills',
    );
  });

  it('ignores target directory persistence failures after a successful install', async () => {
    chooseCustomTargetDirectory('./custom/skills');
    await expect(
      runInstall(
        {},
        {
          saveTargetDirectory: vi.fn().mockRejectedValue(new Error('boom')),
        },
      ),
    ).resolves.toBeUndefined();

    expect(projectInstall.installBaseSkillToProject).toHaveBeenCalledTimes(1);
    expect(prompts.log.success).toHaveBeenCalledWith(
      t('installedSkillsIntoTargetDir', {
        count: 1,
        targetDir: resolveExpectedTargetDir('./custom/skills'),
        linkSuffix: '',
      }),
    );
  });

  it('does not record built-in or flag-provided target directories', async () => {
    await runInstall({});
    await runInstall({ dir: './from-flag' });

    expect(skillLock.addSavedTargetDirectory).not.toHaveBeenCalled();
  });
});
