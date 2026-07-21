import pc from 'picocolors';
import { listBaseSkills } from './base-dir.js';
import { t } from './i18n.js';
import { getBaseDir } from './paths.js';
import { groupBaseSkills } from './skill-groups.js';

export async function runList(): Promise<void> {
  const skills = await listBaseSkills();

  if (skills.length === 0) {
    console.log(t('noSkillsFoundInBaseDir', { baseDir: getBaseDir() }));
    return;
  }

  console.log(t('baseDirLabel', { baseDir: getBaseDir() }));
  for (const group of groupBaseSkills(skills)) {
    console.log();
    console.log(pc.bold(group.label));
    for (const skill of group.skills) {
      const display =
        skill.lockEntry?.displayName &&
        skill.lockEntry.displayName !== skill.directoryName
          ? ` (${skill.lockEntry.displayName})`
          : '';
      console.log(`  - ${skill.directoryName}${display}`);
    }
  }
}
