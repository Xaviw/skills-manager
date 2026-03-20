import { execFileSync, execSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('dist build', () => {
  it(
    'builds and runs the compiled cli without errors',
    { timeout: 60000 },
    () => {
      execSync('pnpm build', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: 'pipe',
        shell: true,
      });

      const output = execFileSync(
        process.execPath,
        [join(process.cwd(), 'dist', 'cli.js'), '--help'],
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          stdio: 'pipe',
        },
      );

      expect(output).toContain('skls-mgr <command> [options]');
      expect(output).toContain('update [names...]');
    },
  );
});
