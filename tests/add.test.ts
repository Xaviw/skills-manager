import { existsSync, rmSync } from 'fs';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as prompts from '@clack/prompts';
import * as listPrompt from '../src/list-prompt.js';
import { parseAddOptions, runAdd } from '../src/add.js';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
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

describe('add command helpers', () => {
  it('parses repeated --skill flags', () => {
    const result = parseAddOptions(['repo', '--skill', 'skill-one', '--skill', 'skill-two']);

    expect(result).toEqual({
      source: 'repo',
      options: { skill: ['skill-one', 'skill-two'] },
    });
  });

  it('parses multiple skill names after a single --skill flag', () => {
    const result = parseAddOptions(['repo', '--skill', 'skill-one', 'skill-two']);

    expect(result).toEqual({
      source: 'repo',
      options: { skill: ['skill-one', 'skill-two'] },
    });
  });
});

describe('add command', () => {
  let homeDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'skls-mgr-home-'));
    originalHome = process.env.USERPROFILE;
    process.env.USERPROFILE = homeDir;
    process.env.HOME = homeDir;
    vi.mocked(listPrompt.multiselectListPrompt).mockReset();
    vi.mocked(listPrompt.multiselectListPrompt).mockResolvedValue(['agent-browser']);
  });

  afterEach(() => {
    process.env.USERPROFILE = originalHome;
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
    if (homeDir && existsSync(homeDir)) {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('keeps the skill name intact and sanitizes long multiline hints for the picker', async () => {
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
      'utf-8'
    );

    await runAdd(sourceRepo);

    expect(prompts.log.message).toHaveBeenCalled();
    expect(listPrompt.multiselectListPrompt).toHaveBeenCalledTimes(1);
    const [call] = vi.mocked(listPrompt.multiselectListPrompt).mock.calls;
    const option = call?.[0].options[0];
    expect(option?.value).toBe('agent-browser');
    expect(option?.label).toBe('agent-browser');
    expect(option?.hint).toContain('Browser automation');
    expect(option?.hint).toContain('...');
    expect(option?.hint).not.toContain('\n');
    expect(option?.hint?.length).toBeLessThan(description.replace(/\s+/g, ' ').trim().length);

    rmSync(sourceRepo, { recursive: true, force: true });
  });
});
