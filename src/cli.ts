#!/usr/bin/env node

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseAddOptions, runAdd } from './add.js';
import { t } from './i18n.js';
import { parseInstallOptions, runInstall } from './install.js';
import { runList } from './list.js';
import { runRemove } from './remove.js';
import { runUpdate } from './update.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  const pkgPath = join(__dirname, '..', 'package.json');
  return JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
}

function showHelp(): void {
  console.log(t('helpText'));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);

  if (!command) {
    showHelp();
    return;
  }

  switch (command) {
    case 'add': {
      const { source, options } = parseAddOptions(rest);
      await runAdd(source, options);
      return;
    }
    case 'list':
      await runList();
      return;
    case 'install':
      await runInstall(parseInstallOptions(rest));
      return;
    case 'remove':
      await runRemove(rest);
      return;
    case 'update':
      await runUpdate({ skillNames: rest });
      return;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      return;
    case 'version':
    case '--version':
    case '-v':
      console.log(getVersion());
      return;
    default:
      console.log(t('unknownCommand', { command: command ?? '' }));
      console.log(t('runHelpForUsage'));
      process.exit(1);
  }
}

main();
