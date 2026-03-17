import neostandard, { resolveIgnoresFromGitignore } from 'neostandard';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default [
  ...neostandard({
    ts: true,
    semi: true,
    noJsx: true,
    noStyle: true,
    ignores: resolveIgnoresFromGitignore(),
  }),
  eslintConfigPrettier,
];
