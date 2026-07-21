import * as p from '@clack/prompts';
import { listBaseSkills, removeBaseSkill } from './base-dir.js';
import { t } from './i18n.js';
import { isPromptCancel, multiselectPrompt } from './prompt.js';
import { groupBaseSkills } from './skill-groups.js';

export async function runRemove(skillNames: string[] = []): Promise<void> {
  if (
    skillNames.length === 0 &&
    (!process.stdin.isTTY || !process.stdout.isTTY)
  ) {
    p.log.error(t('nonInteractiveRemoveRequiresNames'));
    process.exit(1);
  }

  const skills = await listBaseSkills();

  if (skillNames.length > 0) {
    const uniqueSkillNames = [...new Set(skillNames)];

    for (const skillName of uniqueSkillNames) {
      const matched = skills.find((skill) => skill.directoryName === skillName);
      if (!matched) {
        p.log.error(t('skillNotFound', { skillName }));
        process.exit(1);
      }
    }

    for (const skillName of uniqueSkillNames) {
      await removeBaseSkill(skillName);
    }

    if (uniqueSkillNames.length === 1) {
      const [skillName] = uniqueSkillNames;
      p.log.success(t('removedSkill', { skillName: skillName! }));
    } else {
      p.log.success(t('removedSkills', { count: uniqueSkillNames.length }));
    }
    return;
  }

  if (skills.length === 0) {
    p.log.error(t('noSkillsAvailableInBaseDir'));
    process.exit(1);
  }

  const groups = groupBaseSkills(skills);
  const selection = await multiselectPrompt({
    message: t('selectSkillsToRemove'),
    options: groups.flatMap((group) =>
      group.skills.map((skill) => ({
        value: skill.directoryName,
        label: skill.directoryName,
        group: group.label,
      })),
    ),
  });

  if (isPromptCancel(selection)) {
    p.cancel(t('removalCancelled'));
    return;
  }

  for (const selectedName of selection) {
    await removeBaseSkill(selectedName);
  }

  p.log.success(t('removedSkills', { count: selection.length }));
}
