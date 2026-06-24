# Contributing to agent-sync

Thanks for your interest — this project is open to PRs from anyone.

## Ground rules

- Be kind. We assume good intent.
- Keep PRs focused: one logical change per PR.
- For anything non-trivial, open an issue first so we can agree on the shape before code review.
- **Do not file security issues as public issues.** See [SECURITY.md](SECURITY.md).

## Dev setup

```bash
git clone https://github.com/balangyaoejuspher/agent-sync.git
cd agent-sync
npm install
npm run typecheck
npm run build
node dist/index.js --help
```

Requires Node.js >= 18.17.

## Project layout

```
src/
  index.ts              CLI entry, arg parsing, command dispatch
  commands/             One file per CLI command
  core/
    detector.ts         Stack profiler (language / framework / ORM / pm)
    generator.ts        Schema, query-pattern, and route extractors + template engine
  services/
    registry.ts         Remote / cached / bundled skill resolution
templates/
  skills/               Bundled skill templates (manifest.json + SKILL.md + optional refs/scripts)
  mcp-server.mjs        Stdio MCP server copied into user projects by `mcp install`
```

## Adding a new skill template

1. Create `templates/skills/<name>/manifest.json` and `SKILL.md`.
2. Use `{{PLACEHOLDER}}` tokens for any content that should be filled in from the user's repo.
3. Add the variable to `buildSynthesisVars` in `src/core/generator.ts` and extract it in `src/commands/add.ts` if it needs a fresh extractor.
4. Test against at least one real-world project.

### `manifest.json` shape

```json
{
  "name": "my-skill",
  "version": "0.1.0",
  "description": "What this skill does.",
  "tags": ["topic-a", "topic-b"],
  "files": ["references/example.md"],
  "requires": {
    "language": ["typescript", "javascript"],
    "framework": ["nextjs", "express"],
    "orm": ["prisma", "drizzle"]
  }
}
```

`requires` is advisory — a mismatch yields a warning, not an error.

### Available `{{PLACEHOLDER}}` tokens

Always populated:

- `{{PROJECT_LANGUAGE}}`, `{{PROJECT_FRAMEWORK}}`, `{{PROJECT_ORM}}`, `{{PROJECT_PACKAGE_MANAGER}}`
- `{{GENERATED_AT}}`

DB-related (populated when the project has a recognized ORM):

- `{{DB_DIALECT}}`, `{{DB_SCHEMA_CONTEXT}}`, `{{QUERY_PATTERNS}}`

Routes (populated when the skill is `api-endpoint-explorer` or `auth-map`):

- `{{API_ROUTES}}`, `{{API_ROUTE_COUNT}}`, `{{ROUTING_STYLE}}`

Auth (populated when the skill is `auth-map`):

- `{{AUTH_MIDDLEWARES}}`, `{{AUTH_ROLES}}`
- `{{PUBLIC_ROUTES}}`, `{{AUTH_ROUTES}}`
- `{{AUTH_ROUTE_COUNT}}`, `{{PUBLIC_ROUTE_COUNT}}`

CI (populated when the skill is `ci-pipeline`):

- `{{CI_SYSTEMS}}`, `{{CI_WORKFLOWS}}`, `{{CI_SECRETS}}`

### How resolution works at runtime

`agent-sync add <name>` resolves the template in this order:

1. **Remote registry** — `${AGENT_SYNC_REGISTRY ?? DEFAULT_REMOTE_BASE}/<name>/manifest.json` (default: `https://raw.githubusercontent.com/balangyaoejuspher/agent-sync/main/templates/skills`).
2. **Local cache** — `~/.cache/agent-sync/registry/<name>/`.
3. **Bundled** — the copy that ships inside the installed `agent-sync` package.

Anyone running `agent-sync add` after your PR merges to `main` will pick up the new skill immediately — no npm release required.

## Adding a stack detector

1. Add the new option to the relevant union type in `src/core/detector.ts`.
2. Add the detection branch (signature file, dependency name, decorator grep, etc.).
3. If the new ORM has a schema layout, add an `extractSchema` branch in `src/core/generator.ts`.
4. If the new framework has routes, add a `extractApiRoutes` branch.

## Coding conventions

- TypeScript strict mode. No `any` slipped in via type assertions unless absolutely necessary.
- No comments in source files — code should be self-explanatory. Markdown templates and docs are obviously fine.
- Prefer small, composable functions over one large pipeline.
- All file paths in user-visible output should be `path.relative()`-ised to the project root.

## Tests

```bash
npm test          # runs vitest once
npm run test:watch
```

Tests live under `tests/`, fixtures under `tests/fixtures/`. When adding a new detector, extractor, or skill, add a fixture project + a focused test rather than expanding an existing test file with many assertions.

## Releasing

Releases are automated. To cut one:

1. Bump `version` in `package.json` to the new version.
2. Open a PR with the bump, get it merged into `main`.
3. After the merge lands, tag and push:

   ```bash
   git tag v$(node -p "require('./package.json').version")
   git push origin --tags
   ```

4. The `release` workflow (`.github/workflows/release.yml`) will:
   - re-run typecheck / build / tests
   - verify the tag matches `package.json#version`
   - publish to npm with `--provenance` using the `NPM_TOKEN` secret
   - create a GitHub Release with auto-generated notes

### One-time setup for npm publishing

1. Create an npm access token (Automation token preferred). https://www.npmjs.com/settings/<your-user>/tokens
2. In the repo settings, create an Environment named `npm` (Settings → Environments → New environment).
3. Add a secret `NPM_TOKEN` to that environment.
4. The `release` job is wired to `environment: npm` so the token is only exposed to that job.

## Branch protection

`main` is protected: PRs are required, the `ci` status check must pass, force pushes and deletions are blocked, and history is linear. If you're a maintainer who needs the exact ruleset spec, ping the lead — it isn't checked into the public repo by design.

