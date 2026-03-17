type LocaleCode = 'en' | 'zh';

type MessageParams = Record<string, string | number>;
type MessageValue = string | ((params: MessageParams) => string);

const withParams = (fn: (params: MessageParams) => string): MessageValue => fn;

const enMessages = {
  helpText: `Usage: skls-mgr <command> [options]

Commands:
  add <source>               Add skills to ~/.config/skls-mgr
  list                       List all managed and manual skills
  install                    Install skills to the target directory
  remove [names...]          Interactively or by specified names remove skills
  update [names...]          Interactively or by specified names update skills
  help                       Show help
  version                    Show version

Add Options:
  -s, --skill <names...>     Install specified skills from the source

Install Options:
  -a, --all                  Skip selection and install all skills
  -d, --dir <path>           Skip selection and specify the target directory
  -l, --link                 Skip selection and install using symlinks
  -c, --copy                 Skip selection and install using copies

General:
  -h, --help                 Show help
  -v, --version              Show version`,
  unknownCommand: withParams(({ command }) => `Unknown command: ${command}`),
  runHelpForUsage: 'Run skls-mgr help or skls-mgr --help for usage.',
  directoryExistsPrompt: withParams(
    ({ defaultName }) =>
      `Directory "${defaultName}" already exists. Enter a new directory name`,
  ),
  directoryNameRequired: 'Directory name is required.',
  skillDirectoryConflict: withParams(
    ({ directoryName }) =>
      `Skill directory "${directoryName}" already exists or conflicts with another selected skill.`,
  ),
  installationCancelled: 'Installation cancelled.',
  missingSource: 'Missing source.',
  noSkillsFoundInSource: 'No skills found in source.',
  noMatchingSkillsFound: withParams(
    ({ names }) => `No matching skills found for: ${names}`,
  ),
  selectSkillsToInstall: 'Select skills to install',
  multiselectPromptHelp:
    'Use arrow keys to navigate · Space to select · A to select all · Enter to confirm · Esc to cancel',
  selectPromptHelp:
    'Use arrow keys to navigate · Enter to confirm · Esc to cancel',
  targetDirectoryPromptHelp:
    'Use arrow keys to switch · Type to edit the focused path · Enter to confirm · Esc to cancel',
  promptNoOptions: '(no options)',
  promptCancelled: 'Cancelled',
  promptSelectedCount: withParams(({ count }) => `Selected: ${count}`),
  promptMoreAbove: withParams(({ count }) => `↑ ${count} more above`),
  promptMoreBelow: withParams(({ count }) => `↓ ${count} more below`),
  promptSummaryMore: withParams(({ count }) => `+${count} more`),
  installedSkillsIntoBaseDir: withParams(
    ({ count, baseDir }) => `Installed ${count} skill(s) into ${baseDir}`,
  ),
  unknownError: 'Unknown error',
  failedToClone: withParams(
    ({ url, message }) => `Failed to clone ${url}: ${message}`,
  ),
  attemptedTempDirCleanupOutsideTemp:
    'Attempted to clean up directory outside of temp directory',
  customPathLabel: 'Custom path...',
  targetDirectory: 'Target directory',
  noSkillsAvailableInBaseDir: 'No skills available in BaseDir.',
  selectSkillsToInstallIntoProject: 'Select skills to install into project',
  installationMode: 'Installation mode',
  symlink: 'Symlink',
  copy: 'Copy',
  installedSkillsIntoTargetDir: withParams(
    ({ count, targetDir, linkSuffix }) =>
      `Installed ${count} skill(s) into ${targetDir}${linkSuffix}`,
  ),
  usingLinksWherePossible: ' using links where possible',
  noSkillsFoundInBaseDir: withParams(
    ({ baseDir }) => `No skills found in ${baseDir}`,
  ),
  baseDirLabel: withParams(({ baseDir }) => `BaseDir: ${baseDir}`),
  managedSkills: 'Managed Skills',
  manualSkills: 'Manual Skills',
  none: '(none)',
  skillNotFound: withParams(
    ({ skillName }) => `Skill "${skillName}" was not found.`,
  ),
  selectSkillsToRemove: 'Select skills to remove',
  removalCancelled: 'Removal cancelled.',
  removedSkill: withParams(({ skillName }) => `Removed ${skillName}`),
  removedSkills: withParams(({ count }) => `Removed ${count} skill(s)`),
  localPath: 'Local path',
  gitUrlHashTrackingUnsupported: 'Git URL (hash tracking not supported)',
  noVersionHashAvailable: 'No version hash available',
  noSkillPathRecorded: 'No skill path recorded',
  noVersionTracking: 'No version tracking',
  noSkillsTrackedInLockFile: 'No skills tracked in lock file.',
  skippedSkills: 'Skipped skills:',
  couldNotFetchFromGitHub: 'Could not fetch from GitHub',
  failedToCheckUpdate: 'Failed to check update',
  checkingSkillUpdatesProgress: withParams(
    ({ current, total, skillName }) =>
      `Checking skill updates ${current}/${total}${skillName ? `: ${skillName}` : ''}`,
  ),
  allSkillsUpToDate: 'All skills are up to date',
  selectSkillsToUpdate: 'Select skills to update',
  updateCancelled: 'Update cancelled',
  noSkillsSelectedForUpdate: 'No skills selected for update.',
  updatingSkillsProgress: withParams(
    ({ current, total, skillName }) =>
      `Updating skills ${current}/${total}${skillName ? `: ${skillName}` : ''}`,
  ),
  couldNotLocateSkillInSource: 'Could not locate skill in source',
  updatedSkills: withParams(({ count }) => `Updated ${count} skill(s)`),
  failedUpdates: 'Failed updates:',
  unsafeSubpath: withParams(
    ({ subpath }) => `Unsafe subpath: "${subpath}" contains ".." segments.`,
  ),
  invalidSubpath: 'Invalid subpath.',
} satisfies Record<string, MessageValue>;

type TranslationKey = keyof typeof enMessages;

const zhMessages: Record<TranslationKey, MessageValue> = {
  helpText: `用法: skls-mgr <command> [options]

命令:
  add <source>               添加技能到 ~/.config/skls-mgr
  list                       列出全部托管技能和手动技能
  install                    安装技能到指定目录
  remove [names...]          交互式或根据指定名称删除技能
  update [names...]          交互式或根据指定名称更新技能
  help                       显示帮助
  version                    显示版本

添加选项:
  -s, --skill <names...>     安装来源中的指定技能

安装选项:
  -a, --all                  跳过选择，安装全部技能
  -d, --dir <path>           跳过选择，指定目标目录
  -l, --link                 跳过选择，使用符号链接安装
  -c, --copy                 跳过选择，使用复制安装

通用:
  -h, --help                 显示帮助
  -v, --version              显示版本`,
  unknownCommand: withParams(({ command }) => `未知命令：${command}`),
  runHelpForUsage: '运行 skls-mgr help 或 skls-mgr --help 查看用法。',
  directoryExistsPrompt: withParams(
    ({ defaultName }) => `目录 "${defaultName}" 已存在，请输入新的目录名`,
  ),
  directoryNameRequired: '目录名不能为空。',
  skillDirectoryConflict: withParams(
    ({ directoryName }) =>
      `技能目录 "${directoryName}" 已存在，或与本次选择的其他技能冲突。`,
  ),
  installationCancelled: '已取消安装。',
  missingSource: '缺少来源参数。',
  noSkillsFoundInSource: '来源中未找到任何技能。',
  noMatchingSkillsFound: withParams(
    ({ names }) => `未找到匹配的技能：${names}`,
  ),
  selectSkillsToInstall: '选择要安装的技能',
  multiselectPromptHelp:
    '↑↓ 切换 · Space 选择 · A 全选 · Enter 确认 · Esc 取消',
  selectPromptHelp: '↑↓ 切换 · Enter 确认 · Esc 取消',
  targetDirectoryPromptHelp:
    '↑↓ 切换 · 直接输入编辑当前路径 · Enter 确认 · Esc 取消',
  promptNoOptions: '（无可选项）',
  promptCancelled: '已取消',
  promptSelectedCount: withParams(({ count }) => `已选 ${count} 项`),
  promptMoreAbove: withParams(({ count }) => `↑ 上方还有 ${count} 项`),
  promptMoreBelow: withParams(({ count }) => `↓ 下方还有 ${count} 项`),
  promptSummaryMore: withParams(({ count }) => `+${count} 项`),
  installedSkillsIntoBaseDir: withParams(
    ({ count, baseDir }) => `已安装 ${count} 个技能到 ${baseDir}`,
  ),
  unknownError: '未知错误',
  failedToClone: withParams(
    ({ url, message }) => `克隆 ${url} 失败：${message}`,
  ),
  attemptedTempDirCleanupOutsideTemp: '尝试清理临时目录之外的目录',
  customPathLabel: '自定义路径...',
  targetDirectory: '目标目录',
  noSkillsAvailableInBaseDir: 'BaseDir 中没有可用技能。',
  selectSkillsToInstallIntoProject: '选择要安装到项目中的技能',
  installationMode: '安装方式',
  symlink: '符号链接',
  copy: '复制',
  installedSkillsIntoTargetDir: withParams(
    ({ count, targetDir, linkSuffix }) =>
      `已安装 ${count} 个技能到 ${targetDir}${linkSuffix}`,
  ),
  usingLinksWherePossible: '，可链接时优先使用链接',
  noSkillsFoundInBaseDir: withParams(
    ({ baseDir }) => `${baseDir} 中未找到任何技能`,
  ),
  baseDirLabel: withParams(({ baseDir }) => `BaseDir：${baseDir}`),
  managedSkills: '托管技能',
  manualSkills: '手动技能',
  none: '（无）',
  skillNotFound: withParams(({ skillName }) => `未找到技能 "${skillName}"。`),
  selectSkillsToRemove: '选择要删除的技能',
  removalCancelled: '已取消删除。',
  removedSkill: withParams(({ skillName }) => `已移除 ${skillName}`),
  removedSkills: withParams(({ count }) => `已移除 ${count} 个技能`),
  localPath: '本地路径',
  gitUrlHashTrackingUnsupported: 'Git URL（不支持哈希跟踪）',
  noVersionHashAvailable: '没有可用的版本哈希',
  noSkillPathRecorded: '没有记录技能路径',
  noVersionTracking: '没有版本跟踪信息',
  noSkillsTrackedInLockFile: '锁文件中没有跟踪任何技能。',
  skippedSkills: '已跳过的技能：',
  couldNotFetchFromGitHub: '无法从 GitHub 获取信息',
  failedToCheckUpdate: '检查更新失败',
  checkingSkillUpdatesProgress: withParams(
    ({ current, total, skillName }) =>
      `正在检查技能更新 ${current}/${total}${skillName ? `：${skillName}` : ''}`,
  ),
  allSkillsUpToDate: '所有技能都已是最新版本',
  selectSkillsToUpdate: '选择要更新的技能',
  updateCancelled: '已取消更新',
  noSkillsSelectedForUpdate: '未选择任何要更新的技能。',
  updatingSkillsProgress: withParams(
    ({ current, total, skillName }) =>
      `正在更新技能 ${current}/${total}${skillName ? `：${skillName}` : ''}`,
  ),
  couldNotLocateSkillInSource: '无法在来源中定位该技能',
  updatedSkills: withParams(({ count }) => `已更新 ${count} 个技能`),
  failedUpdates: '更新失败：',
  unsafeSubpath: withParams(
    ({ subpath }) => `不安全的子路径："${subpath}" 包含 ".." 段。`,
  ),
  invalidSubpath: '无效的子路径。',
};

const messages: Record<LocaleCode, Record<TranslationKey, MessageValue>> = {
  en: enMessages,
  zh: zhMessages,
};

export function resolveCliLocale(
  locale = process.env.LC_ALL ??
    process.env.LC_MESSAGES ??
    process.env.LANG ??
    new Intl.DateTimeFormat().resolvedOptions().locale,
): LocaleCode {
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function t(
  key: TranslationKey,
  params: MessageParams = {},
  locale = resolveCliLocale(),
): string {
  const entry = messages[locale][key];
  return typeof entry === 'function' ? entry(params) : entry;
}
