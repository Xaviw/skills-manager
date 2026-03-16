export interface Skill {
  name: string;
  description: string;
  path: string;
}

export type ParsedSourceType = 'github' | 'git' | 'local';

export interface ParsedSource {
  type: ParsedSourceType;
  url: string;
  subpath?: string;
  localPath?: string;
  ref?: string;
}

export interface ManagedSkillLockEntry {
  displayName: string;
  source: string;
  sourceType: ParsedSourceType;
  sourceUrl: string;
  skillPath?: string;
  skillFolderHash: string;
  installedAt: string;
  updatedAt: string;
}

export interface ManagedSkillLockFile {
  version: number;
  skills: Record<string, ManagedSkillLockEntry>;
}

export interface BaseSkillInfo {
  directoryName: string;
  managed: boolean;
  lockEntry?: ManagedSkillLockEntry;
  path: string;
}
