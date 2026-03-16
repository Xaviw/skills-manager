import { execFileSync } from 'child_process';
import { join } from 'path';
import { pathToFileURL } from 'url';

const CLI_PATH = join(import.meta.dirname, 'cli.ts');
const TSX_IMPORT_PATH = pathToFileURL(
  join(import.meta.dirname, '..', 'node_modules', 'tsx', 'dist', 'loader.mjs')
).href;

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function runCli(
  args: string[],
  cwd?: string,
  env?: Record<string, string>,
  input?: string
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const output = execFileSync(process.execPath, ['--import', TSX_IMPORT_PATH, CLI_PATH, ...args], {
      encoding: 'utf-8',
      cwd,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env ? { ...process.env, ...env } : process.env,
    });

    return { stdout: stripAnsi(output), stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: stripAnsi(error.stdout || ''),
      stderr: stripAnsi(error.stderr || ''),
      exitCode: error.status || 1,
    };
  }
}
