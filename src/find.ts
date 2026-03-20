import * as p from '@clack/prompts';
import { parseAddOptions, runAdd } from './add.js';
import { t } from './i18n.js';
import { isListPromptCancel, selectListPrompt } from './list-prompt.js';
import { formatPromptHint, showPromptHelp } from './prompt-format.js';

const DEFAULT_FIND_LIMIT = 10;
const DEFAULT_RESULTS_TO_PRINT = 6;

export interface FindSkillResult {
  name: string;
  slug: string;
  source: string;
  installs: number;
}

interface SearchApiSkill {
  id?: unknown;
  name?: unknown;
  installs?: unknown;
  source?: unknown;
  topSource?: unknown;
}

function getFindApiBase(): string {
  return (
    process.env.SKLS_MGR_FIND_API_URL ??
    process.env.SKILLS_API_URL ??
    'https://skills.sh'
  ).replace(/\/+$/, '');
}

function getFindSiteBase(): string {
  return (
    process.env.SKLS_MGR_FIND_SITE_URL ??
    process.env.SKILLS_SITE_URL ??
    'https://skills.sh'
  ).replace(/\/+$/, '');
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInstallCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeSearchApiSkill(
  entry: SearchApiSkill,
): FindSkillResult | null {
  const name = normalizeString(entry.name);
  const slug = normalizeString(entry.id);
  const source =
    normalizeString(entry.source) || normalizeString(entry.topSource);

  if (!name || !slug) {
    return null;
  }

  return {
    name,
    slug,
    source,
    installs: normalizeInstallCount(entry.installs),
  };
}

function getResponseEntries(payload: unknown): SearchApiSkill[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const response = payload as Record<string, unknown>;
  return Array.isArray(response.skills)
    ? (response.skills as SearchApiSkill[])
    : [];
}

function formatInstallCount(installs: number): string {
  if (!Number.isFinite(installs) || installs <= 0) {
    return '';
  }

  if (installs >= 1_000_000) {
    return `${(installs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M installs`;
  }

  if (installs >= 1_000) {
    return `${(installs / 1_000).toFixed(1).replace(/\.0$/, '')}K installs`;
  }

  return `${installs} install${installs === 1 ? '' : 's'}`;
}

function getInstallPackage(result: FindSkillResult): string {
  return result.source || result.slug;
}

function formatFindResultLine(result: FindSkillResult): string {
  const pkg = getInstallPackage(result);
  const installs = formatInstallCount(result.installs);
  return `${pkg}@${result.name}${installs ? ` (${installs})` : ''}`;
}

function buildResultUrl(result: FindSkillResult): string {
  return `${getFindSiteBase()}/${result.slug}`;
}

async function promptForFindQuery(): Promise<string | symbol> {
  return p.text({
    message: t('findQueryPrompt'),
    placeholder: 'react performance',
    validate(value) {
      if (!value.trim()) {
        return t('missingFindQuery');
      }
    },
  });
}

export async function searchSkills(
  query: string,
  options: {
    fetchImpl?: typeof fetch;
    apiBase?: string;
    limit?: number;
  } = {},
): Promise<FindSkillResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const apiBase = (options.apiBase ?? getFindApiBase()).replace(/\/+$/, '');
  const limit = options.limit ?? DEFAULT_FIND_LIMIT;

  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${apiBase}/api/search?q=${encodeURIComponent(normalizedQuery)}&limit=${limit}`,
    );

    if (!response.ok) {
      return [];
    }

    return getResponseEntries(await response.json())
      .map((entry) => normalizeSearchApiSkill(entry))
      .filter((entry): entry is FindSkillResult => entry !== null)
      .sort((left, right) => right.installs - left.installs);
  } catch {
    return [];
  }
}

export async function runFind(
  args: string[],
  options: {
    searchSkillsImpl?: typeof searchSkills;
    promptForQuery?: () => Promise<string | symbol>;
    promptSelect?: typeof selectListPrompt;
    runAddImpl?: typeof runAdd;
    isInteractive?: boolean;
    logPromptHelp?: (helpText: string) => void;
    log?: (message: string) => void;
  } = {},
): Promise<void> {
  const providedQuery = args.join(' ').trim();
  const isInteractive =
    options.isInteractive ??
    (Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY));
  const log = options.log ?? console.log;

  let query = providedQuery;

  if (!query) {
    if (!isInteractive) {
      p.log.error(t('missingFindQuery'));
      process.exit(1);
    }

    const input = await (options.promptForQuery ?? promptForFindQuery)();
    if (p.isCancel(input)) {
      p.cancel(t('findCancelled'));
      return;
    }

    query = String(input).trim();
    if (!query) {
      p.log.error(t('missingFindQuery'));
      process.exit(1);
    }
  }

  const results = await (options.searchSkillsImpl ?? searchSkills)(query);

  if (results.length === 0) {
    log(t('noSkillsFoundForQuery', { query }));
    return;
  }

  if (providedQuery) {
    log(t('findInstallWithAdd'));
    log('');
    for (const result of results.slice(0, DEFAULT_RESULTS_TO_PRINT)) {
      log(formatFindResultLine(result));
      log(`${t('findUrlPrefix')}${buildResultUrl(result)}`);
      log('');
    }
    return;
  }

  (options.logPromptHelp ?? showPromptHelp)(t('selectPromptHelp'));
  const selection = await (options.promptSelect ?? selectListPrompt)({
    message: t('selectSkillToAdd'),
    options: results.map((result) => {
      const installs = formatInstallCount(result.installs);
      const hint = result.source
        ? `${result.source}${installs ? ` · ${installs}` : ''}`
        : installs;
      return {
        value: `${result.slug}::${result.name}`,
        label: result.name,
        hint: formatPromptHint(hint),
      };
    }),
    initialValue: `${results[0]!.slug}::${results[0]!.name}`,
  });

  if (isListPromptCancel(selection)) {
    p.cancel(t('findCancelled'));
    return;
  }

  const selected = results.find(
    (result) => `${result.slug}::${result.name}` === selection,
  );
  if (!selected) {
    p.log.error(t('unknownError'));
    process.exit(1);
  }

  const pkg = getInstallPackage(selected);
  log('');
  log(t('findInstallingSkill', { skillName: selected.name, pkg }));
  log('');

  const addArgs = parseAddOptions([pkg, '--skill', selected.name]);
  await (options.runAddImpl ?? runAdd)(addArgs.source, addArgs.options);

  log('');
  log(t('findViewSkillAt', { url: buildResultUrl(selected) }));
  log('');
}
