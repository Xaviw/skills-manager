import { existsSync, rmSync } from 'fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as prompts from '@clack/prompts';
import * as prompt from '../src/prompt.js';
import { parseAddOptions, runAdd } from '../src/add.js';
import { getBaseDir } from '../src/paths.js';
import { t } from '../src/i18n.js';

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

describe('add command helpers', () => {
  it('parses repeated --skill flags', () => {
    const result = parseAddOptions([
      'repo',
      '--skill',
      'skill-one',
      '--skill',
      'skill-two',
    ]);

    expect(result).toEqual({
      source: 'repo',
      options: { skill: ['skill-one', 'skill-two'] },
    });
  });

  it('parses multiple skill names after a single --skill flag', () => {
    const result = parseAddOptions([
      'repo',
      '--skill',
      'skill-one',
      'skill-two',
    ]);

    expect(result).toEqual({
      source: 'repo',
      options: { skill: ['skill-one', 'skill-two'] },
    });
  });
});

describe('add command', () => {
  let homeDir: string;
  let originalHome: string | undefined;
  let originalInputIsTTY: PropertyDescriptor | undefined;
  let originalOutputIsTTY: PropertyDescriptor | undefined;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'skls-mgr-home-'));
    originalHome = process.env.USERPROFILE;
    originalInputIsTTY = Object.getOwnPropertyDescriptor(
      process.stdin,
      'isTTY',
    );
    originalOutputIsTTY = Object.getOwnPropertyDescriptor(
      process.stdout,
      'isTTY',
    );
    process.env.USERPROFILE = homeDir;
    process.env.HOME = homeDir;
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    vi.mocked(prompt.multiselectPrompt).mockReset();
    vi.mocked(prompt.multiselectPrompt).mockResolvedValue([
      'skills/agent-browser/SKILL.md',
    ]);
  });

  afterEach(() => {
    process.env.USERPROFILE = originalHome;
    process.env.HOME = originalHome;
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
    vi.restoreAllMocks();
    if (homeDir && existsSync(homeDir)) {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('passes skill identity and description to the picker', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    const skillDir = join(sourceRepo, 'skills', 'agent-browser');
    const description = [
      'Browser automation and accessibility snapshots for interactive sites.',
      'Includes deliberately long text so the terminal picker hint would wrap',
      'and repaint incorrectly if it were rendered verbatim.',
    ].join('\n');

    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---\nname: agent-browser\ndescription: |\n  ${description.replace(/\n/g, '\n  ')}\n---\n\n# Agent Browser\n`,
      'utf-8',
    );

    await runAdd(sourceRepo);

    expect(prompt.multiselectPrompt).toHaveBeenCalledTimes(1);
    const [call] = vi.mocked(prompt.multiselectPrompt).mock.calls;
    const option = call?.[0].options[0];
    expect(option?.value).toBe('skills/agent-browser/SKILL.md');
    expect(option?.label).toBe('agent-browser');
    expect(option?.hint).toBe(`${description} - skills/agent-browser/SKILL.md`);

    rmSync(sourceRepo, { recursive: true, force: true });
  });

  it('lists source skills in natural display-name order', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    for (const [directory, name] of [
      ['a', 'skill-10'],
      ['b', 'skill-2'],
      ['z', 'Alpha'],
    ] as const) {
      const skillDir = join(sourceRepo, directory);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${name}\n---\n`,
        'utf-8',
      );
    }
    vi.mocked(prompt.multiselectPrompt).mockResolvedValue([]);

    await runAdd(sourceRepo);

    const [call] = vi.mocked(prompt.multiselectPrompt).mock.calls;
    expect(call?.[0].options.map((option) => option.label)).toEqual([
      'Alpha',
      'skill-2',
      'skill-10',
    ]);
    rmSync(sourceRepo, { recursive: true, force: true });
  });

  it('uses skillPath as the stable tie-break for equal display names', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    for (const directory of ['z', 'a']) {
      const skillDir = join(sourceRepo, directory);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        '---\nname: shared\ndescription: shared\n---\n',
        'utf-8',
      );
    }
    vi.mocked(prompt.multiselectPrompt).mockResolvedValue([]);

    await runAdd(sourceRepo);

    const [call] = vi.mocked(prompt.multiselectPrompt).mock.calls;
    expect(call?.[0].options.map((option) => option.value)).toEqual([
      'a/SKILL.md',
      'z/SKILL.md',
    ]);
    rmSync(sourceRepo, { recursive: true, force: true });
  });

  it('supports a home-directory source path via ~ shorthand', async () => {
    const sourceRepo = join(homeDir, 'tilde-source');
    const skillDir = join(sourceRepo, 'skills', 'agent-browser');

    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nname: agent-browser\ndescription: Browser automation\n---\n\n# Agent Browser\n',
      'utf-8',
    );

    await runAdd('~/tilde-source');

    expect(prompt.multiselectPrompt).toHaveBeenCalledTimes(1);
    expect(existsSync(join(getBaseDir(), 'agent-browser', 'SKILL.md'))).toBe(
      true,
    );
  });

  it('reuses the existing directory for the same Managed Skill Identity', async () => {
    const sourceRepo = await mkdtemp(join(tmpdir(), 'skls-mgr-source-'));
    const skillDir = join(sourceRepo, 'skills', 'shared');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nname: old-name\ndescription: old\n---\n',
      'utf-8',
    );
    await runAdd(sourceRepo, { skill: ['old-name'] });

    await writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nname: new-name\ndescription: new\n---\n',
      'utf-8',
    );
    await runAdd(sourceRepo, { skill: ['new-name'] });

    expect(
      await readFile(join(getBaseDir(), 'old-name', 'SKILL.md'), 'utf-8'),
    ).toContain('name: new-name');
    expect(existsSync(join(getBaseDir(), 'new-name'))).toBe(false);
    rmSync(sourceRepo, { recursive: true, force: true });
  });

  it('returns normally when directory conflict input is cancelled', async () => {
    const sourceRepo = join(homeDir, 'source');
    const skillDir = join(sourceRepo, 'agent-browser');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nname: agent-browser\ndescription: Browser automation\n---\n',
      'utf-8',
    );
    await mkdir(join(getBaseDir(), 'agent-browser'), { recursive: true });
    vi.mocked(prompt.multiselectPrompt).mockResolvedValue([
      'agent-browser/SKILL.md',
    ]);
    vi.mocked(prompt.textPrompt).mockResolvedValue('cancel');
    vi.mocked(prompt.isPromptCancel).mockImplementation(
      (value) => value === 'cancel',
    );
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    await expect(runAdd(sourceRepo)).resolves.toBeUndefined();

    expect(prompts.cancel).toHaveBeenCalledWith(t('installationCancelled'));
    expect(exit).not.toHaveBeenCalled();
  });
});
