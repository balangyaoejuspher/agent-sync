import fs from "fs-extra";
import path from "node:path";
import type { ProjectContext } from "./core/detector.js";

export type AiClient = "claude" | "copilot" | "cursor";

export const ALL_CLIENTS: readonly AiClient[] = [
  "claude",
  "copilot",
  "cursor",
] as const;

export const CLIENT_LABELS: Record<AiClient, string> = {
  claude: "Claude Code",
  copilot: "GitHub Copilot",
  cursor: "Cursor",
};

export interface AgentSyncConfig {
  version: number;
  generatedAt: string;
  context: ProjectContext;
  targets: AiClient[];
}

export function configPath(root: string): string {
  return path.join(root, ".agents", "config.json");
}

export async function loadConfig(
  root: string,
): Promise<AgentSyncConfig | null> {
  const p = configPath(root);
  if (!(await fs.pathExists(p))) return null;
  try {
    const raw = (await fs.readJson(p)) as Partial<AgentSyncConfig>;
    if (!raw || typeof raw !== "object") return null;
    if (!Array.isArray(raw.targets)) return null;
    return raw as AgentSyncConfig;
  } catch {
    return null;
  }
}

export async function writeConfig(
  root: string,
  cfg: AgentSyncConfig,
): Promise<void> {
  await fs.ensureDir(path.dirname(configPath(root)));
  await fs.writeJson(configPath(root), cfg, { spaces: 2 });
}

export function sanitizeTargets(values: unknown): AiClient[] {
  if (!Array.isArray(values)) return [...ALL_CLIENTS];
  const out: AiClient[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const lower = v.toLowerCase();
    if ((ALL_CLIENTS as readonly string[]).includes(lower))
      out.push(lower as AiClient);
  }
  return out.length > 0 ? Array.from(new Set(out)) : [...ALL_CLIENTS];
}
