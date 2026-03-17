import pc from 'picocolors';
import { listBaseSkills } from './base-dir.js';
import { t } from './i18n.js';
import { getBaseDir } from './paths.js';

export async function runList(): Promise<void> {
  const skills = await listBaseSkills();

  if (skills.length === 0) {
    console.log(t('noSkillsFoundInBaseDir', { baseDir: getBaseDir() }));
    return;
  }

  const managed = skills.filter((skill) => skill.managed);
  const manual = skills.filter((skill) => !skill.managed);

  console.log(t('baseDirLabel', { baseDir: getBaseDir() }));
  console.log();

  console.log(pc.bold(t('managedSkills')));
  if (managed.length === 0) {
    console.log(`  ${t('none')}`);
  } else {
    for (const skill of managed) {
      const display =
        skill.lockEntry?.displayName &&
        skill.lockEntry.displayName !== skill.directoryName
          ? ` (${skill.lockEntry.displayName})`
          : '';
      console.log(`  - ${skill.directoryName}${display}`);
    }
  }

  console.log();
  console.log(pc.bold(t('manualSkills')));
  if (manual.length === 0) {
    console.log(`  ${t('none')}`);
    return;
  }

  for (const skill of manual) {
    console.log(`  - ${skill.directoryName}`);
  }
}
