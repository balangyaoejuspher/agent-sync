import path from "node:path";
import {
  intro,
  outro,
  spinner,
  multiselect,
  isCancel,
  log,
  note,
} from "@clack/prompts";
import { detectProjectContext } from "../core/detector.js";
import {
  ALL_CLIENTS,
  CLIENT_LABELS,
  loadConfig,
  writeConfig,
  type AgentSyncConfig,
  type AiClient,
} from "../config.js";

export interface InitOptions {
  targets?: AiClient[];
  yes?: boolean;
}

export async function runInit(
  targetDir: string,
  opts: InitOptions = {},
): Promise<void> {
  intro("agentic-sync init");
  const s = spinner();

  s.start("Profiling repository...");
  const context = await detectProjectContext(targetDir);
  s.stop(
    `Detected: ${context.language} / ${context.framework} / orm=${context.orm} / pm=${context.packageManager}`,
  );

  const existing = await loadConfig(context.root);
  const defaults = opts.targets ?? existing?.targets ?? [...ALL_CLIENTS];

  let targets: AiClient[] = defaults;
  const interactive = process.stdin.isTTY === true && !opts.yes;

  if (interactive && !opts.targets) {
    const answer = await multiselect({
      message: "Which AI clients should we generate context for?",
      options: ALL_CLIENTS.map((id) => ({
        value: id,
        label: CLIENT_LABELS[id],
      })),
      initialValues: defaults,
      required: false,
    });
    if (isCancel(answer)) {
      log.warn("Cancelled — keeping previous selection.");
    } else if (Array.isArray(answer)) {
      targets = answer.length > 0 ? (answer as AiClient[]) : [...ALL_CLIENTS];
    }
  }

  s.start("Scaffolding .agents/ ...");
  const cfg: AgentSyncConfig = {
    version: 1,
    generatedAt: new Date().toISOString(),
    context,
    targets,
  };
  await writeConfig(context.root, cfg);
  s.stop(
    `Wrote ${path.relative(context.root, path.join(context.root, ".agents", "config.json"))}`,
  );

  note(
    [
      `Targets: ${targets.map((t) => CLIENT_LABELS[t]).join(", ")}`,
      "",
      "Next steps:",
      "  • Run `agentic-sync list` to see available skills.",
      "  • Run `agentic-sync add db-navigator` to synthesize a Database Schema Navigator skill.",
      "  • Run `agentic-sync compile` to fan skills out into the IDE rule files for the selected clients.",
    ].join("\n"),
    "Ready",
  );
  outro("Done.");
}
