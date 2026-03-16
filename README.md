# skls-mgr

[简体中文](./README-CN.md)

Maintain Agent Skills in a centralized local directory; Install on-demand across projects; Edit once, sync everywhere.

## Why not [vercel-labs/skills](https://github.com/vercel-labs/skills)?

This project is inspired by [`vercel-labs/skills`](<https://www.google.com/search?q=%5Bhttps://github.com/vercel-labs/skills%5D(https://github.com/vercel-labs/skills)>). We are grateful to the Vercel Labs team for their contribution to the Agent ecosystem.

`vercel-labs/skills` only supports installing skills directly to a project or globally, which often leads to skill files being scattered across multiple locations. Furthermore, when you need to install skills into different projects, you frequently have to look up the original installation commands.

## Quick Start

Find your target skills on [skills.sh](https://skills.sh/), and simply replace `skills` with `skls-mgr` in the installation command:

```bash
npx skls-mgr add https://github.com/vercel-labs/skills --skill find-skills

```

Once installed, the skills will be copied to the `~/.config/skls-mgr` directory. You can then run the following in any project:

```bash
npx skls-mgr install

```

Select the skills required for your project through the interactive interface. The installation is complete once confirmed.

## Adding Skills

```bash
npx skls-mgr add <source>

```

By default, this opens an interactive interface listing all available skills from the source.

### Options

| Option                   | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `-s, --skill <names...>` | Specify skill names directly to skip the interactive selection |

### Examples

```bash
# GitHub shorthand (owner/repo)
npx skls-mgr add vercel-labs/skills

# GitHub repository URL
npx skls-mgr add https://github.com/vercel-labs/skills

# Sub-path within a GitHub repository
npx skls-mgr add https://github.com/vercel-labs/skills/tree/main/skills/find-skills

# Any Git URL
npx skls-mgr add https://github.com/vercel-labs/skills.git
npx skls-mgr add git@github.com:vercel-labs/skills.git

# Local path (copy)
npx skls-mgr add ./my-local-skills

# Install specific skills (repeated flags)
npx skls-mgr add vercel-labs/agent-skills --skill frontend-design --skill skill-creator

# Install specific skills (multiple names after a single flag)
npx skls-mgr add vercel-labs/agent-skills --skill frontend-design skill-creator

```

### Conflict Resolution

If the directory name of the skill being installed conflicts with an existing top-level directory in `~/.config/skls-mgr`:

- **Interactive Mode**: You will be prompted to enter a new directory name.
- **Non-interactive Mode**: If `--skill` is used, the command will terminate immediately without automatic renaming.

## Installing to Projects

```bash
npx skls-mgr install

```

By default, this opens an interactive interface listing all top-level directories in `~/.config/skls-mgr` (including manually created skills).

### Options

| Option             | Description                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `-a, --all`        | Install all skills. If not specified, allows interactive selection.                                 |
| `-d, --dir <path>` | Install to the target directory (absolute or relative). If not specified, allows interactive input. |
| `-l, --link`       | Use symbolic links.                                                                                 |
| `-c, --copy`       | Use direct copy.                                                                                    |

### Examples

```bash
# Interactive installation to a project
npx skls-mgr install

# Copy all skills to the Claude Code skills directory
npx skls-mgr install --all --dir ./.claude/skills --copy

# Interactively select skills and link them to the .agents/skills directory
# Flags can be combined; missing arguments will be prompted interactively
npx skls-mgr install --dir ./.agents/skills --link

```

### Overwrite Policy

If a skill directory with the same name already exists in the target project, `skls-mgr install` will overwrite it directly without further confirmation.

When `--link` is selected, if the current environment does not support creating symbolic links, it will automatically fall back to a direct copy.

## Other Commands

| Command                      | Description                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `npx skls-mgr list`              | List all skills in `~/.config/skls-mgr`, distinguishing between managed and manual skills. |
| `npx skls-mgr update [names...]` | Update one or more skills. Opens interactive mode if no names are provided.            |
| `npx skls-mgr remove [names...]` | Remove one or more skills. Opens interactive mode if no names are provided.            |

### Examples

```bash
# Display all skills (including manually added ones)
npx skls-mgr list

# Interactive update
npx skls-mgr update

# Force update specific skills by name
npx skls-mgr update skill1 skill2

# Interactive removal
npx skls-mgr remove

# Remove specific skills by name
npx skls-mgr remove skill1 skill2

```

> `skls-mgr update` relies on the GitHub API. To avoid rate limits for anonymous requests (60 per hour), it is recommended to configure `GITHUB_TOKEN` or `GH_TOKEN` in your environment variables to increase the quota (5000 per hour).

## License

MIT
