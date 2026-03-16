# task completion checklist

Before considering a change complete in this repo:

- Run `pnpm type-check` for TypeScript correctness.
- Run `pnpm test` for behavioral coverage.
- If entrypoint or packaging behavior changed, also run `pnpm build`.
- If the change touches CLI behavior, prefer exercising the affected command through `pnpm dev -- <command>`.
- Keep ESM import style consistent (`./module.js` from TypeScript source).
- Preserve existing translated/error-reporting patterns using `t(...)` and `@clack/prompts` logging.
- Since no lint/formatter script is defined, manually keep formatting aligned with surrounding files.
