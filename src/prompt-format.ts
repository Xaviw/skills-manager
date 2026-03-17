import * as p from '@clack/prompts';
import pc from 'picocolors';

const DEFAULT_HINT_MAX_LENGTH = 56;

function formatPromptText(
  value: string,
  maxLength: number,
): string | undefined {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return undefined;
  }

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  if (maxLength <= 3) {
    return '.'.repeat(Math.max(maxLength, 0));
  }

  return `${collapsed.slice(0, maxLength - 3).trimEnd()}...`;
}

export function formatPromptHint(
  value: string,
  maxLength = DEFAULT_HINT_MAX_LENGTH,
): string | undefined {
  return formatPromptText(value, maxLength);
}

export function showPromptHelp(
  helpText: string,
  logMessage: (message: string) => void = p.log.message,
): void {
  logMessage(`${pc.dim(helpText)}\n`);
}
