import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { intro, outro, spinner, log } from "@clack/prompts";
import { loadConfig, type AiClient } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type McpClient = "claude" | "cursor";

export const MCP_CLIENTS: readonly McpClient[] = ["claude", "cursor"] as const;

export interface McpInstallOptions {
  clients?: McpClient[];
  serverName?: string;
}

type IdeConfig = {
  mcpServers?: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >;
};

function bundledTemplatesDir(): string {
  const candidates = [
    path.resolve(__dirname, "..", "templates"),
    path.resolve(__dirname, "..", "..", "templates"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

function claudeDesktopConfigPath(): string {
  const platform = process.platform;
  if (platform === "win32") {
    const appData =
      process.env["APPDATA"] ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  return path.join(
    os.homedir(),
    ".config",
    "Claude",
    "claude_desktop_config.json",
  );
}

function cursorConfigPath(): string {
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

async function installMcpServerScript(projectRoot: string): Promise<string> {
  const src = path.join(bundledTemplatesDir(), "mcp-server.mjs");
  const destDir = path.join(projectRoot, ".agents");
  await fs.ensureDir(destDir);
  const dest = path.join(destDir, "mcp-server.mjs");
  await fs.copyFile(src, dest);
  return dest;
}

async function patchIdeConfig(
  configPath: string,
  serverName: string,
  serverScript: string,
  projectRoot: string,
): Promise<{ created: boolean; backedUpTo: string | null }> {
  let existing: IdeConfig = {};
  let created = true;
  let backedUpTo: string | null = null;

  if (await fs.pathExists(configPath)) {
    created = false;
    try {
      existing = (await fs.readJson(configPath)) as IdeConfig;
    } catch {
      existing = {};
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backedUpTo = `${configPath}.bak.${stamp}`;
    await fs.copyFile(configPath, backedUpTo);
  } else {
    await fs.ensureDir(path.dirname(configPath));
  }

  if (!existing.mcpServers) existing.mcpServers = {};
  existing.mcpServers[serverName] = {
    command: "node",
    args: [serverScript, "--project", projectRoot],
  };

  await fs.writeJson(configPath, existing, { spaces: 2 });
  return { created, backedUpTo };
}

function defaultServerName(projectRoot: string): string {
  const base =
    path
      .basename(projectRoot)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project";
  return `agent-sync-${base}`;
}

export async function runMcpInstall(
  targetDir: string,
  opts: McpInstallOptions = {},
): Promise<void> {
  intro("agent-sync mcp install");
  const s = spinner();

  const projectRoot = path.resolve(targetDir);
  const serverName = opts.serverName ?? defaultServerName(projectRoot);

  let chosen: McpClient[];
  if (opts.clients && opts.clients.length > 0) {
    chosen = opts.clients;
  } else {
    const cfg = await loadConfig(projectRoot);
    const configured = (cfg?.targets ?? []).filter((t: AiClient): t is McpClient =>
      (MCP_CLIENTS as readonly string[]).includes(t),
    );
    chosen = configured.length > 0 ? configured : [...MCP_CLIENTS];
  }

  s.start("Installing MCP server script into .agents/...");
  const serverScript = await installMcpServerScript(projectRoot);
  s.stop(`Server script: ${path.relative(projectRoot, serverScript)}`);

  const clients: Array<{ label: string; configPath: string }> = [];
  if (chosen.includes("claude")) {
    clients.push({
      label: "Claude Desktop",
      configPath: claudeDesktopConfigPath(),
    });
  }
  if (chosen.includes("cursor")) {
    clients.push({ label: "Cursor", configPath: cursorConfigPath() });
  }

  for (const c of clients) {
    s.start(`Patching ${c.label} config (${c.configPath})...`);
    try {
      const res = await patchIdeConfig(
        c.configPath,
        serverName,
        serverScript,
        projectRoot,
      );
      if (res.created) {
        s.stop(`${c.label}: created ${c.configPath}`);
      } else {
        s.stop(
          `${c.label}: updated. Backup at ${path.basename(res.backedUpTo ?? "")}`,
        );
      }
    } catch (err) {
      s.stop(`${c.label}: failed`);
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Could not patch ${c.label}: ${msg}`);
    }
  }

  log.info(
    [
      `Registered MCP server name: ${serverName}`,
      `Restart Claude Desktop / Cursor for the changes to take effect.`,
      `Exposed tools: list_skills, read_skill`,
      `Exposed resources: agent-sync://<skill>/<file> (one per file under .agents/skills/)`,
    ].join("\n"),
  );

  outro("Done.");
}
