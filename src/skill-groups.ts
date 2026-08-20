import { resolve } from 'path';
import { t } from './i18n.js';
import { getOwnerRepo } from './source-parser.js';
import type {
  BaseSkillInfo,
  ManagedSkillLockEntry,
  SourceDescriptor,
} from './types.js';

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export interface BaseSkillGroup {
  label: string;
  skills: BaseSkillInfo[];
}

export interface RepositoryGroup<T> {
  label: string;
  items: T[];
}

export function compareNames(left: string, right: string): number {
  return nameCollator.compare(left, right);
}

export function compareStableNames(left: string, right: string): number {
  return (
    compareNames(left, right) || (left === right ? 0 : left < right ? -1 : 1)
  );
}

export function getGitHubRepository(
  entry: ManagedSkillLockEntry,
): string | undefined {
  if (entry.sourceType === 'local') {
    return undefined;
  }
  const repository = getOwnerRepo({
    type: entry.sourceType,
    url: entry.sourceUrl,
  });
  if (repository) {
    return repository.toLowerCase();
  }
  return entry.sourceType === 'github' ? entry.source.toLowerCase() : undefined;
}

export function getRepositoryIdentity(entry: ManagedSkillLockEntry): string {
  if (entry.sourceType === 'local') {
    return resolve(entry.sourceUrl);
  }
  return (
    getOwnerRepo({
      type: entry.sourceType,
      url: entry.sourceUrl,
    })?.toLowerCase() ?? entry.sourceUrl
  );
}

export function getSourceRepositoryIdentity(source: SourceDescriptor): string {
  if (source.kind === 'local') {
    return resolve(source.localPath);
  }
  if (source.kind === 'remote') {
    return source.url;
  }
  return (
    source.githubRepo?.toLowerCase() ??
    getOwnerRepo({ type: 'git', url: source.url })?.toLowerCase() ??
    source.url
  );
}

export function groupManagedItems<T>(
  items: T[],
  getEntry: (item: T) => ManagedSkillLockEntry,
  getName: (item: T) => string,
): Array<RepositoryGroup<T>> {
  const repositories = new Map<string, T[]>();
  for (const item of items) {
    const identity = getRepositoryIdentity(getEntry(item));
    const group = repositories.get(identity) ?? [];
    group.push(item);
    repositories.set(identity, group);
  }
  return [...repositories]
    .sort(([left], [right]) => compareStableNames(left, right))
    .map(([label, groupItems]) => ({
      label,
      items: groupItems.sort((left, right) =>
        compareStableNames(getName(left), getName(right)),
      ),
    }));
}

export function groupBaseSkills(skills: BaseSkillInfo[]): BaseSkillGroup[] {
  const manual = skills
    .filter((skill) => !skill.managed)
    .sort((left, right) =>
      compareStableNames(left.directoryName, right.directoryName),
    );
  const groups = groupManagedItems(
    skills.filter(
      (skill): skill is BaseSkillInfo & { lockEntry: ManagedSkillLockEntry } =>
        Boolean(skill.lockEntry),
    ),
    (skill) => skill.lockEntry,
    (skill) => skill.directoryName,
  ).map((group) => ({ label: group.label, skills: group.items }));

  return manual.length > 0
    ? [{ label: t('manualSkills'), skills: manual }, ...groups]
    : groups;
}
