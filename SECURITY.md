# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

This project uses **GitHub's private vulnerability reporting**. To report:

1. Go to the [Security tab](https://github.com/balangyaoejuspher/agent-sync/security) of this repository.
2. Click **Report a vulnerability** (under "Advisories").
3. Fill in the form. The report stays private between you and the maintainers until a fix is shipped and an advisory is published.

If you don't have a GitHub account, open an issue titled `Security contact request` (no details) and a maintainer will respond.

## Scope

The following are in scope:

- The `agent-sync` CLI (`init`, `add`, `list`, `compile`, `mcp install`).
- The bundled MCP server (`templates/mcp-server.mjs`) that is copied into user projects by `mcp install`.
- Bundled skill templates under `templates/skills/`.

The following are **out of scope** for security reports (open a normal issue instead):

- Bugs in third-party libraries we depend on. Report those upstream; we'll bump the dependency once a fix lands.
- The user's IDE behavior after we register an MCP server. Report those to the IDE vendor.

## What to expect

- Acknowledgement of receipt as soon as the maintainers see the report.
- A public security advisory once a fix is released, crediting the reporter unless they prefer to remain anonymous.

## Hardening notes for users

- `agent-sync mcp install` writes to the user's IDE configuration files. It always creates a timestamped backup (`*.bak.<timestamp>`) next to the original.
- The MCP server only exposes files under the project's `.agents/skills/` directory and rejects URIs that try to escape it.
- The remote skill registry is fetched over HTTPS. Use `--registry <url>` to point at a registry you control, or `--offline` to skip the network entirely and rely on the bundled / cached templates.
