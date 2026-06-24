import fs from "fs-extra";
import path from "node:path";
import { intro, outro, spinner, log } from "@clack/prompts";
import { loadConfig } from "../config.js";

interface DoctorFinding {
  level: "info" | "warn" | "error";
  skill?: string;
  message: string;
}

export async function runDoctor(targetDir: string): Promise<void> {
  intro("agent-sync doctor");
  const s = spinner();
  const root = path.resolve(targetDir);
  const findings: DoctorFinding[] = [];

  s.start("Reading .agents/config.json...");
  const cfg = await loadConfig(root);
  if (!cfg) {
    s.stop("No config.");
    findings.push({
      level: "error",
      message: "Missing .agents/config.json — run `agent-sync init` first.",
    });
  } else {
    s.stop(
      `Config: ${cfg.context.language}/${cfg.context.framework}/${cfg.context.orm}, targets=${cfg.targets.join(",")}`,
    );
    const ageDays =
      (Date.now() - new Date(cfg.generatedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (ageDays > 30) {
      findings.push({
        level: "warn",
        message: `config.json is ${ageDays.toFixed(0)} days old. Re-run \`agent-sync init\` if the stack has changed.`,
      });
    }
    if (cfg.context.framework === "unknown") {
      findings.push({
        level: "warn",
        message:
          "Framework was not detected. Skills that depend on routing may be empty.",
      });
    }
    if (cfg.context.orm === "none") {
      findings.push({
        level: "info",
        message:
          "No ORM detected. The db-navigator skill will produce a placeholder.",
      });
    }
  }

  s.start("Inspecting installed skills...");
  const skillsDir = path.join(root, ".agents", "skills");
  if (!(await fs.pathExists(skillsDir))) {
    s.stop("No skills installed.");
    findings.push({
      level: "warn",
      message: "No .agents/skills/ directory. Run `agent-sync add <skill>`.",
    });
  } else {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skillNames = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    s.stop(`Found ${skillNames.length} skill(s).`);

    for (const name of skillNames) {
      const skillDir = path.join(skillsDir, name);
      const skillFile = path.join(skillDir, "SKILL.md");
      if (!(await fs.pathExists(skillFile))) {
        findings.push({
          level: "error",
          skill: name,
          message: "Missing SKILL.md.",
        });
        continue;
      }
      const body = await fs.readFile(skillFile, "utf8");

      const unresolved = body.match(/\{\{\s*[A-Z0-9_]+\s*\}\}/g);
      if (unresolved && unresolved.length > 0) {
        findings.push({
          level: "warn",
          skill: name,
          message: `${unresolved.length} unresolved placeholder(s): ${[...new Set(unresolved)].slice(0, 5).join(", ")}`,
        });
      }

      const fmMatch = body.match(/^---\r?\n[\s\S]*?\r?\n---/);
      if (!fmMatch) {
        findings.push({
          level: "warn",
          skill: name,
          message: "SKILL.md is missing front-matter (--- ... ---).",
        });
      }

      if (body.length < 200) {
        findings.push({
          level: "warn",
          skill: name,
          message: `SKILL.md is suspiciously short (${body.length} bytes).`,
        });
      }

      if (
        name === "db-navigator" &&
        body.includes("No schema source detected")
      ) {
        findings.push({
          level: "info",
          skill: name,
          message:
            "Schema was not embedded. The detector didn't find your model files.",
        });
      }
      if (
        (name === "api-endpoint-explorer" || name === "auth-map") &&
        body.includes("_No routes detected._")
      ) {
        findings.push({
          level: "info",
          skill: name,
          message:
            "No routes detected. Make sure the framework signature is recognizable.",
        });
      }
    }
  }

  s.start("Inspecting IDE fan-out...");
  const fanouts: Array<{ label: string; path: string }> = [
    { label: "CLAUDE.md", path: path.join(root, "CLAUDE.md") },
    {
      label: ".github/copilot-instructions.md",
      path: path.join(root, ".github", "copilot-instructions.md"),
    },
    { label: ".cursor/rules/", path: path.join(root, ".cursor", "rules") },
  ];
  const fanoutPresent: string[] = [];
  for (const f of fanouts) {
    if (await fs.pathExists(f.path)) fanoutPresent.push(f.label);
  }
  s.stop(
    fanoutPresent.length === 0
      ? "No IDE fan-out detected."
      : `Fan-out present: ${fanoutPresent.join(", ")}`,
  );
  if (cfg && fanoutPresent.length === 0) {
    findings.push({
      level: "warn",
      message:
        "No IDE rule files written. Run `agent-sync compile` so Claude/Copilot/Cursor pick up the skills.",
    });
  }

  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  const infos = findings.filter((f) => f.level === "info");

  for (const f of errors) {
    log.error(formatFinding(f));
  }
  for (const f of warns) {
    log.warn(formatFinding(f));
  }
  for (const f of infos) {
    log.info(formatFinding(f));
  }

  if (findings.length === 0) {
    outro("All good.");
  } else {
    outro(
      `${errors.length} error(s), ${warns.length} warning(s), ${infos.length} info note(s).`,
    );
  }

  if (errors.length > 0) process.exit(1);
}

function formatFinding(f: DoctorFinding): string {
  return f.skill ? `[${f.skill}] ${f.message}` : f.message;
}
