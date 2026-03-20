import pc from 'picocolors';
import { stripVTControlCharacters } from 'node:util';

const SPINNER_FRAMES = ['◒', '◐', '◓', '◑'];
const SPINNER_SUCCESS_SYMBOL = '◇';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_DOWN = '\x1b[J';
const MOVE_UP = (count: number): string => `\x1b[${count}A`;
const MOVE_TO_COL = (column: number): string => `\x1b[${column}G`;

export interface ProgressSpinner {
  start: (message?: string) => void;
  message: (message?: string) => void;
  stop: (message?: string) => void;
}

function getTerminalTextWidth(text: string): number {
  let width = 0;

  for (const char of stripVTControlCharacters(text)) {
    // eslint-disable-next-line no-control-regex
    width += /[^\u0000-\u00ff]/.test(char) ? 2 : 1;
  }

  return width;
}

function getRenderedLineCount(text: string): number {
  const columns = Math.max(process.stdout.columns ?? 80, 1);

  return text.split('\n').reduce((count, line) => {
    const width = getTerminalTextWidth(line);
    return count + Math.max(1, Math.ceil(width / columns));
  }, 0);
}

export function createProgressSpinner(): ProgressSpinner {
  let currentMessage = '';
  let renderedLines = 0;
  let frameIndex = 0;
  let dots = 0;
  let interval: NodeJS.Timeout | null = null;
  let isActive = false;
  let removeProcessHandlers: (() => void) | null = null;

  const rerender = (line: string): void => {
    if (renderedLines > 0) {
      process.stdout.write(MOVE_UP(renderedLines) + MOVE_TO_COL(1));
    }

    process.stdout.write(CLEAR_DOWN);
    process.stdout.write(`${line}\n`);
    renderedLines = getRenderedLineCount(line);
  };

  const clearRenderedOutput = (): void => {
    if (renderedLines > 0) {
      process.stdout.write(MOVE_UP(renderedLines) + MOVE_TO_COL(1));
      process.stdout.write(CLEAR_DOWN);
      renderedLines = 0;
    }
  };

  const cleanup = (
    message = currentMessage,
    options: { renderFinalMessage?: boolean } = {},
  ): void => {
    const { renderFinalMessage = true } = options;

    if (interval) {
      clearInterval(interval);
      interval = null;
    }

    if (removeProcessHandlers) {
      removeProcessHandlers();
      removeProcessHandlers = null;
    }

    if (!isActive && renderedLines === 0) {
      process.stdout.write(SHOW_CURSOR);
      return;
    }

    isActive = false;
    currentMessage = message.replace(/\.+$/, '');

    if (renderFinalMessage) {
      rerender(`${pc.green(SPINNER_SUCCESS_SYMBOL)}  ${currentMessage}`);
    } else {
      clearRenderedOutput();
    }

    process.stdout.write(SHOW_CURSOR);
  };

  const renderFrame = (): void => {
    const frame = pc.magenta(SPINNER_FRAMES[frameIndex]!);
    const suffix = '.'.repeat(dots);
    rerender(`${frame}  ${currentMessage}${suffix}`);
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
    dots = (dots + 1) % 4;
  };

  const registerProcessHandlers = (): void => {
    const handleExit = (): void => {
      cleanup(currentMessage, { renderFinalMessage: false });
    };

    process.once('exit', handleExit);
    process.once('uncaughtExceptionMonitor', handleExit);
    process.once('unhandledRejection', handleExit);

    removeProcessHandlers = (): void => {
      process.removeListener('exit', handleExit);
      process.removeListener('uncaughtExceptionMonitor', handleExit);
      process.removeListener('unhandledRejection', handleExit);
    };
  };

  return {
    start(message = ''): void {
      if (isActive) {
        return;
      }

      currentMessage = message.replace(/\.+$/, '');
      renderedLines = 0;
      frameIndex = 0;
      dots = 0;
      isActive = true;

      process.stdout.write(HIDE_CURSOR);
      registerProcessHandlers();
      renderFrame();
      interval = setInterval(renderFrame, 80);
      interval.unref();
    },
    message(message = ''): void {
      currentMessage = message.replace(/\.+$/, '');
      if (isActive) {
        renderFrame();
      }
    },
    stop(message = ''): void {
      if (!isActive) {
        return;
      }
      cleanup(message || currentMessage);
    },
  };
}
