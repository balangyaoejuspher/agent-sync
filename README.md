# agentic-sync

[![npm version](https://img.shields.io/npm/v/agentic-sync.svg?logo=npm)](https://www.npmjs.com/package/agentic-sync)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen.svg?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Built with tsup](https://img.shields.io/badge/built%20with-tsup-FF6A33.svg)](https://tsup.egoist.dev/)
[![Agent Skills spec](https://img.shields.io/badge/spec-Agent%20Skills-7c3aed.svg)](https://agentskills.io)
[![MCP](https://img.shields.io/badge/MCP-stdio%20server-0EA5E9.svg)](https://modelcontextprotocol.io)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> A package manager for AI context. Map any codebase's stack and bootstrap localized Agent Skills + MCP configs for Claude Code, Copilot Workspace, and Cursor.

`agentic-sync` inspects your repository (databases, frameworks, language runtimes, conventions) and synthesizes [Agent Skills](https://agentskills.io) tailored to _your_ code — not a generic template. The output is a `.agents/` folder that any modern AI coding agent already understands.

## Quick start

```bash
npx agentic-sync init
npx agentic-sync add db-navigator
```

That's it. Your AI now knows your schema, your query patterns, and your conventions.

## What it does

| Stage         | Action                                                                           |
| ------------- | -------------------------------------------------------------------------------- |
| 1. Discover   | Scans for `package.json`, `schema.prisma`, `requirements.txt`, `models.py`, etc. |
| 2. Profile    | Identifies language, framework, ORM, database.                                   |
| 3. Fetch      | Pulls the base skill template from the agentic-sync registry.                      |
| 4. Synthesize | Replaces `{{PLACEHOLDERS}}` with content extracted from _your_ repo.             |
| 5. Write      | Emits a spec-compliant `.agents/skills/<skill>/` directory.                      |

## Commands

```bash
agentic-sync init            # cache project context, scaffold .agents/
agentic-sync add <skill>     # synthesize and inject a skill
agentic-sync list            # list available skills in the registry
```

## Bundled reference skill

- **`db-navigator`** — a Database Schema Navigator. Reads Prisma / Drizzle / SQLAlchemy / Django / TypeORM / raw SQL migrations and injects the schema plus the top query patterns from your existing code.

## Output shape

```
your-app/
└── .agents/
    ├── config.json
    └── skills/
        └── db-navigator/
            ├── SKILL.md
            ├── references/
            └── scripts/
```

## Project status

Early. The CLI scaffold, detector, generator, and the `db-navigator` reference skill are in place. The remote registry currently resolves from bundled templates; HTTP-backed registry resolution lands in the next milestone.

## License

MIT
