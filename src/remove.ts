import * as p from '@clack/prompts';
import { listBaseSkills, removeBaseSkill } from './base-dir.js';
import { t } from './i18n.js';
import { isListPromptCancel, multiselectListPrompt } from './list-prompt.js';
import { showPromptHelp } from './prompt-format.js';

export async function runRemove(skillNames: string[] = []): Promise<void> {
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

  showPromptHelp(t('multiselectPromptHelp'));
  const selection = await multiselectListPrompt({
    message: t('selectSkillsToRemove'),
    options: skills.map((skill) => ({
      value: skill.directoryName,
      label: skill.directoryName,
    })),
    required: true,
  });

  if (isListPromptCancel(selection)) {
    p.cancel(t('removalCancelled'));
    return;
  }

  const selectedNames = selection as string[];
  for (const selectedName of selectedNames) {
    await removeBaseSkill(selectedName);
  }

  p.log.success(t('removedSkills', { count: selectedNames.length }));
}
