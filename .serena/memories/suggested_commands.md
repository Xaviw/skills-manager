# suggested commands

- Install deps: `pnpm install`
- Run CLI in dev mode: `pnpm dev -- <command> [args]`
- Direct dev entrypoint: `node --import tsx src/cli.ts <command> [args]`
- Build distributable CLI: `pnpm build`
- Type-check: `pnpm type-check`
- Run tests: `pnpm test`
- Publish safety check used by package scripts: `pnpm type-check && pnpm test`

## Common CLI examples
- `pnpm dev -- list`
- `pnpm dev -- add <source>`
- `pnpm dev -- install`
- `pnpm dev -- update`
- `pnpm dev -- remove`

## Useful Darwin/macOS shell commands
- `pwd`, `cd`, `ls`, `find`, `rg`, `sed -n 'start,endp' <file>`, `git status`, `git diff`
