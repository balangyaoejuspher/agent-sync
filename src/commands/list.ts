import { intro, outro, log } from "@clack/prompts";
import { listBundledSkills } from "../services/registry.js";

export async function runList(): Promise<void> {
  intro("agentic-sync list");
  const skills = await listBundledSkills();
  if (skills.length === 0) {
    log.warn("No skills available in the bundled registry.");
    outro("Done.");
    return;
  }
  for (const s of skills) {
    const tags = s.tags && s.tags.length > 0 ? `  [${s.tags.join(", ")}]` : "";
    log.info(`${s.name}@${s.version}${tags}\n  ${s.description}`);
  }
  outro(`${skills.length} skill(s) available.`);
}
