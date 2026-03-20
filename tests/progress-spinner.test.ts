import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgressSpinner } from '../src/progress-spinner.js';

describe('progress spinner', () => {
  let originalColumns: PropertyDescriptor | undefined;
  const handlers: Record<string, () => void> = {};

  beforeEach(() => {
    originalColumns = Object.getOwnPropertyDescriptor(
      process.stdout,
      'columns',
    );
    Object.defineProperty(process.stdout, 'columns', {
      value: 20,
      configurable: true,
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'once').mockImplementation(((
      event: string,
      listener: () => void,
    ) => {
      handlers[event] = listener;
      return process;
    }) as typeof process.once);
    vi.spyOn(process, 'removeListener').mockImplementation(
      (() => process) as typeof process.removeListener,
    );

    const fakeInterval = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    vi.spyOn(global, 'setInterval').mockReturnValue(fakeInterval);
    vi.spyOn(global, 'clearInterval').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    vi.restoreAllMocks();
    if (originalColumns) {
      Object.defineProperty(process.stdout, 'columns', originalColumns);
    }
  });

  it('unrefs the timer and restores the cursor when stopped', () => {
    const spinner = createProgressSpinner();

    spinner.start('Loading...');
    spinner.message('Loading 1/1');
    spinner.stop('Loaded');

    const interval = vi.mocked(global.setInterval).mock.results[0]!
      .value as unknown as { unref: () => void };
    const output = vi
      .mocked(process.stdout.write)
      .mock.calls.map(([value]) => String(value))
      .join('');

    expect(interval.unref).toHaveBeenCalledTimes(1);
    expect(output).toContain('\x1b[?25l');
    expect(output).toContain('\x1b[?25h');
    expect(output).toContain('Loaded');
    expect(output).toContain('◇');
    expect(process.removeListener).toHaveBeenCalledWith(
      'unhandledRejection',
      expect.any(Function),
    );
  });

  it('cleans up without rendering a success line when the process exits unexpectedly', () => {
    const spinner = createProgressSpinner();

    spinner.start('Pending');
    handlers.exit?.();

    const output = vi
      .mocked(process.stdout.write)
      .mock.calls.map(([value]) => String(value))
      .join('');

    expect(output).toContain('\x1b[?25h');
    expect(output).not.toContain('◇  Pending');
    expect(global.clearInterval).toHaveBeenCalled();
  });
});
