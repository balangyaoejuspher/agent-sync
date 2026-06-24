import { cancel, isCancel } from "@clack/prompts";
import { runInit, type InitOptions } from "./commands/init.js";
import { runAdd } from "./commands/add.js";
import { runList } from "./commands/list.js";
import { runCompile, type CompileOptions } from "./commands/compile.js";
import {
  runMcpInstall,
  type McpInstallOptions,
  type McpClient,
  MCP_CLIENTS,
} from "./commands/mcp.js";
import { runUpdate } from "./commands/update.js";
import { runDoctor } from "./commands/doctor.js";
import { ALL_CLIENTS, type AiClient } from "./config.js";

const HELP = `agent-sync — package manager for AI context

Usage:
  agent-sync <command> [options]

Commands:
  init [--yes] [--target <list>]    Profile the current repo and scaffold .agents/
                                    Interactive multi-select for AI clients unless --yes
                                    or --target is given.
  add <skill>                       Synthesize and inject a skill into .agents/skills/
  update                            Re-synthesize every installed skill
  list                              List skills available in the bundled registry
  compile [--target <list>]         Fan out skills into IDE-native rule files.
                                    Defaults to the targets chosen during \`init\`.
  mcp install [--client <list>]     Register an MCP server entry pointing at this project's
                                    skills in claude_desktop_config.json / .cursor/mcp.json.
                                    Defaults to the targets chosen during \`init\`.
  doctor                            Lint .agents/ state and report problems
  help                              Show this message

Options:
  --cwd <dir>             Run against a different target directory
  --registry <url>        Override the remote skill registry base URL
                          (env: AGENT_SYNC_REGISTRY)
  --offline               Skip the network; use cache or bundled templates only
  --target <list>         Comma-separated subset of: claude, copilot, cursor (or "all")
  --client <list>         Comma-separated subset of: claude, cursor (or "all")
  --server-name <name>    Override the MCP server name
  --yes, -y               Non-interactive; accept defaults
  --version, -v           Print version
  --help, -h              Print this help
`;

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { command: undefined, positional: [], flags: {} };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      out.flags[a.slice(1)] = true;
    } else {
      rest.push(a);
    }
  }
  out.command = rest[0];
  out.positional = rest.slice(1);
  return out;
}

async function readVersion(): Promise<string> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    for (const rel of ["../package.json", "../../package.json"]) {
      try {
        const raw = await readFile(resolve(here, rel), "utf8");
        return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
      } catch {
        continue;
      }
    }
  } catch {
    return "0.0.0";
  }
  return "0.0.0";
}

function strFlag(args: ParsedArgs, key: string): string | undefined {
  const v = args.flags[key];
  return typeof v === "string" ? v : undefined;
}

function boolFlag(args: ParsedArgs, key: string): boolean {
  return args.flags[key] === true;
}

function parseClientList<T extends string>(
  raw: string,
  valid: readonly T[],
): T[] | { error: string } {
  if (raw.trim().toLowerCase() === "all") return [...valid];
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: T[] = [];
  for (const p of parts) {
    if (!(valid as readonly string[]).includes(p)) {
      return {
        error: `unknown value "${p}". Allowed: ${valid.join(", ")}, all`,
      };
    }
    out.push(p as T);
  }
  return Array.from(new Set(out));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (
    boolFlag(args, "help") ||
    boolFlag(args, "h") ||
    args.command === "help" ||
    args.command === undefined
  ) {
    process.stdout.write(HELP);
    return;
  }
  if (boolFlag(args, "version") || boolFlag(args, "v")) {
    process.stdout.write((await readVersion()) + "\n");
    return;
  }

  const cwd = strFlag(args, "cwd") ?? process.cwd();

  switch (args.command) {
    case "init": {
      const initOpts: InitOptions = {};
      if (boolFlag(args, "yes") || boolFlag(args, "y")) initOpts.yes = true;
      const tgt = strFlag(args, "target");
      if (tgt) {
        const parsed = parseClientList<AiClient>(tgt, ALL_CLIENTS);
        if ("error" in parsed) {
          process.stderr.write(`Error: --target ${parsed.error}\n`);
          process.exit(2);
        }
        initOpts.targets = parsed;
      }
      await runInit(cwd, initOpts);
      break;
    }
    case "add": {
      const skill = args.positional[0];
      if (!skill) {
        process.stderr.write(
          "Error: `add` requires a skill name. Example: agent-sync add db-navigator\n",
        );
        process.exit(2);
      }
      const addOpts: { registry?: string; offline?: boolean } = {};
      const reg = strFlag(args, "registry");
      if (reg) addOpts.registry = reg;
      if (boolFlag(args, "offline")) addOpts.offline = true;
      await runAdd(skill, cwd, addOpts);
      break;
    }
    case "update": {
      const updOpts: { registry?: string; offline?: boolean } = {};
      const reg = strFlag(args, "registry");
      if (reg) updOpts.registry = reg;
      if (boolFlag(args, "offline")) updOpts.offline = true;
      await runUpdate(cwd, updOpts);
      break;
    }
    case "doctor":
      await runDoctor(cwd);
      break;
    case "list":
      await runList();
      break;
    case "compile": {
      const target = strFlag(args, "target");
      const compileOpts: CompileOptions = {};
      if (target) {
        const parsed = parseClientList<AiClient>(target, ALL_CLIENTS);
        if ("error" in parsed) {
          process.stderr.write(`Error: --target ${parsed.error}\n`);
          process.exit(2);
        }
        compileOpts.targets = parsed;
      }
      await runCompile(cwd, compileOpts);
      break;
    }
    case "mcp": {
      const sub = args.positional[0];
      if (sub !== "install") {
        process.stderr.write(
          "Error: `mcp` requires a subcommand. Try: agent-sync mcp install\n",
        );
        process.exit(2);
      }
      const mcpOpts: McpInstallOptions = {};
      const client = strFlag(args, "client");
      if (client) {
        const parsed = parseClientList<McpClient>(client, MCP_CLIENTS);
        if ("error" in parsed) {
          process.stderr.write(`Error: --client ${parsed.error}\n`);
          process.exit(2);
        }
        mcpOpts.clients = parsed;
      }
      const serverName = strFlag(args, "server-name");
      if (serverName) mcpOpts.serverName = serverName;
      await runMcpInstall(cwd, mcpOpts);
      break;
    }
    default:
      process.stderr.write(`Unknown command: ${args.command}\n\n${HELP}`);
      process.exit(2);
  }
}

main().catch((err: unknown) => {
  if (isCancel(err)) {
    cancel("Aborted.");
    process.exit(130);
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\nerror: ${message}\n`);
  process.exit(1);
});
