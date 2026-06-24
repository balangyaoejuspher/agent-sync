import fs from "fs-extra";
import path from "node:path";
import { intro, outro, spinner, log } from "@clack/prompts";
import { runAdd } from "./add.js";

export interface UpdateOptions {
  registry?: string;
  offline?: boolean;
}

export async function runUpdate(
  targetDir: string,
  opts: UpdateOptions = {},
): Promise<void> {
  intro("agent-sync update");
  const s = spinner();

  const root = path.resolve(targetDir);
  const skillsDir = path.join(root, ".agents", "skills");

  s.start("Discovering installed skills...");
  if (!(await fs.pathExists(skillsDir))) {
    s.stop("No skills installed.");
    log.warn(
      "No .agents/skills/ directory. Run `agent-sync init` then `agent-sync add <skill>` first.",
    );
    outro("Nothing to update.");
    return;
  }

  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  s.stop(`Found ${names.length} installed skill(s): ${names.join(", ") || "(none)"}`);

  if (names.length === 0) {
    outro("Nothing to update.");
    return;
  }

  const failures: Array<{ skill: string; error: string }> = [];
  for (const name of names) {
    try {
      await runAdd(name, root, opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ skill: name, error: msg });
      log.warn(`Skill "${name}" failed: ${msg}`);
    }
  }

  if (failures.length === 0) {
    outro(`Refreshed ${names.length} skill(s).`);
  } else {
    outro(`Refreshed ${names.length - failures.length}/${names.length} skill(s); ${failures.length} failed.`);
  }
}
