export interface Skill {
  name: string;
  description: string;
  path: string;
}

export type SourceDescriptor =
  | {
      kind: 'local';
      localPath: string;
      subpath?: string;
    }
  | {
      kind: 'git';
      url: string;
      ref?: string;
      subpath?: string;
      githubRepo?: string;
    }
  | {
      kind: 'remote';
      url: string;
      subpath?: string;
      wellKnown: boolean;
    };

export interface SourceSkill extends Skill {
  skillPath: string;
}

export interface SourceIssue {
  code: 'unreadable-skill' | 'invalid-skill' | 'outside-source';
  skillPath: string;
}

export interface SourceSnapshot {
  source: SourceDescriptor;
  skills: SourceSkill[];
  issues: SourceIssue[];
}

export type ParsedSourceType =
  | 'github'
  | 'git'
  | 'local'
  | 'well-known'
  | 'download';

export interface ParsedSource {
  type: ParsedSourceType;
  url: string;
  subpath?: string;
  localPath?: string;
  ref?: string;
}

export interface RemoteSourceResult {
  rootDir: string;
  tempDir: string;
}

export interface ManagedSkillLockEntry {
  displayName: string;
  source: string;
  sourceType: ParsedSourceType;
  sourceUrl: string;
  sourceRef?: string;
  skillPath?: string;
  skillFolderHash: string;
  installedAt: string;
  updatedAt: string;
}

export type ManagedSkillTracking = Omit<
  ManagedSkillLockEntry,
  'installedAt' | 'updatedAt'
>;

export interface ManagedSkillLockFile {
  version: number;
  skills: Record<string, ManagedSkillLockEntry>;
  targetDirectories: string[];
}

export interface BaseSkillInfo {
  directoryName: string;
  managed: boolean;
  lockEntry?: ManagedSkillLockEntry;
  path: string;
}
