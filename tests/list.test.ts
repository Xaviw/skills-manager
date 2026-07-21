import { afterEach, describe, expect, it, vi } from 'vitest';
import { stripVTControlCharacters } from 'node:util';
import * as baseDir from '../src/base-dir.js';
import { t } from '../src/i18n.js';
import { runList } from '../src/list.js';
import type { BaseSkillInfo, ManagedSkillLockEntry } from '../src/types.js';

vi.mock('../src/base-dir.js', () => ({
  listBaseSkills: vi.fn(),
}));

function managed(directoryName: string, sourceUrl: string): BaseSkillInfo {
  const lockEntry: ManagedSkillLockEntry = {
    displayName: directoryName,
    source: sourceUrl,
    sourceType: sourceUrl.includes('github.com') ? 'github' : 'git',
    sourceUrl,
    skillPath: `${directoryName}/SKILL.md`,
    skillFolderHash: '',
    installedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    directoryName,
    managed: true,
    lockEntry,
    path: `/base/${directoryName}`,
  };
}

describe('list command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists manual skills first and repository groups in natural name order', async () => {
    vi.mocked(baseDir.listBaseSkills).mockResolvedValue([
      managed('skill-10', 'https://github.com/Owner/Zeta.git'),
      { directoryName: 'manual', managed: false, path: '/base/manual' },
      managed('skill-2', 'git@github.com:Owner/Zeta.git'),
      managed('alpha', 'https://github.com/owner/Alpha.git'),
    ]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runList();

    expect(
      log.mock.calls.map(([line]) =>
        line === undefined ? undefined : stripVTControlCharacters(String(line)),
      ),
    ).toEqual([
      expect.any(String),
      undefined,
      t('manualSkills'),
      '  - manual',
      undefined,
      'owner/alpha',
      '  - alpha',
      undefined,
      'owner/zeta',
      '  - skill-2',
      '  - skill-10',
    ]);
  });
});
