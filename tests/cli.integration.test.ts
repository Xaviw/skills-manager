import { existsSync, rmSync } from 'fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveCliLocale, t } from '../src/i18n.js';
import { runCli } from '../src/test-utils.js';

async function createSkill(dir: string, name: string, description = 'desc'): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    'utf-8'
  );
}

describe('skls-mgr cli integration', () => {
  let homeDir: string;
  let repoDir: string;
  let projectDir: string;
  const locale = resolveCliLocale();

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'skls-mgr-home-'));
    repoDir = await mkdtemp(join(tmpdir(), 'skls-mgr-repo-'));
    projectDir = await mkdtemp(join(tmpdir(), 'skls-mgr-project-'));

    await createSkill(join(repoDir, 'skills', 'skill-one'), 'skill-one', 'managed one');
    await createSkill(join(repoDir, 'skills', 'skill-two'), 'skill-two', 'managed two');
  });

  afterEach(() => {
    for (const dir of [homeDir, repoDir, projectDir]) {
      if (dir && existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('adds, lists, installs, and removes skills', async () => {
    const env = { USERPROFILE: homeDir, HOME: homeDir };

    const addResult = runCli(['add', repoDir, '--skill', 'skill-one'], projectDir, env);
    expect(addResult.exitCode).toBe(0);

    const baseDir = join(homeDir, '.config', 'skls-mgr');
    const lockContent = JSON.parse(await readFile(join(baseDir, '.skls-mgr-lock.json'), 'utf-8'));
    expect(lockContent.skills['skill-one']).toBeDefined();

    await createSkill(join(baseDir, 'manual-skill'), 'manual-skill', 'manual');

    const listResult = runCli(['list'], projectDir, env);
    expect(listResult.stdout).toContain(t('managedSkills', {}, locale));
    expect(listResult.stdout).toContain('skill-one');
    expect(listResult.stdout).toContain(t('manualSkills', {}, locale));
    expect(listResult.stdout).toContain('manual-skill');

    const installResult = runCli(['install', '--all', '--dir', './synced-skills', '--copy'], projectDir, env);
    expect(installResult.exitCode).toBe(0);
    expect(existsSync(join(projectDir, 'synced-skills', 'skill-one', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'synced-skills', 'manual-skill', 'SKILL.md'))).toBe(true);

    const removeResult = runCli(['remove', 'skill-one', 'manual-skill'], projectDir, env);
    expect(removeResult.exitCode).toBe(0);
    expect(existsSync(join(baseDir, 'skill-one'))).toBe(false);
    expect(existsSync(join(baseDir, 'manual-skill'))).toBe(false);

    const updatedLockContent = JSON.parse(await readFile(join(baseDir, '.skls-mgr-lock.json'), 'utf-8'));
    expect(updatedLockContent.skills['skill-one']).toBeUndefined();
  });

  it('fails in non-interactive mode when the target directory name already exists', async () => {
    const env = { USERPROFILE: homeDir, HOME: homeDir };
    const baseDir = join(homeDir, '.config', 'skls-mgr');
    await createSkill(join(baseDir, 'skill-one'), 'skill-one');

    const result = runCli(['add', repoDir, '--skill', 'skill-one'], projectDir, env);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(t('skillDirectoryConflict', { directoryName: 'skill-one' }, locale));
  });

  it('returns a non-zero exit code for unknown commands', async () => {
    const env = { USERPROFILE: homeDir, HOME: homeDir };

    const result = runCli(['unknown-command'], projectDir, env);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain(t('unknownCommand', { command: 'unknown-command' }, locale));
  });
});
