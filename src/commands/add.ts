import fs from "fs-extra";
import path from "node:path";
import { intro, outro, spinner, log } from "@clack/prompts";
import { detectProjectContext } from "../core/detector.js";
import {
  applyTemplate,
  buildSynthesisVars,
  extractApiRoutes,
  extractAuth,
  extractCi,
  extractQueryPatterns,
  extractSchema,
  routingStyleFor,
  type ApiRoute,
  type AuthReport,
  type CiReport,
} from "../core/generator.js";
import {
  fetchRemoteSkillTemplate,
  type RegistryOptions,
} from "../services/registry.js";

export interface AddOptions {
  registry?: string;
  offline?: boolean;
}

export async function runAdd(
  skillName: string,
  targetDir: string,
  opts: AddOptions = {},
): Promise<void> {
  intro(`agentic-sync add ${skillName}`);
  const s = spinner();

  s.start("Analyzing repository layout...");
  const context = await detectProjectContext(targetDir);
  s.stop(
    `Context: ${context.language} / ${context.framework} / orm=${context.orm}`,
  );

  s.start("Fetching skill template from registry...");
  const registryOpts: RegistryOptions = {};
  if (opts.registry) registryOpts.remoteBase = opts.registry;
  if (opts.offline) registryOpts.offline = true;
  const template = await fetchRemoteSkillTemplate(skillName, registryOpts);
  s.stop(
    `Loaded ${template.manifest.name}@${template.manifest.version} (${template.source})`,
  );

  const required = template.manifest.requires;
  if (required) {
    const mismatches: string[] = [];
    if (required.language && !required.language.includes(context.language)) {
      mismatches.push(
        `language: requires [${required.language.join(", ")}], got ${context.language}`,
      );
    }
    if (required.framework && !required.framework.includes(context.framework)) {
      mismatches.push(
        `framework: requires [${required.framework.join(", ")}], got ${context.framework}`,
      );
    }
    if (required.orm && !required.orm.includes(context.orm)) {
      mismatches.push(
        `orm: requires [${required.orm.join(", ")}], got ${context.orm}`,
      );
    }
    if (mismatches.length > 0) {
      log.warn(`Compatibility hints:\n  - ${mismatches.join("\n  - ")}`);
    }
  }

  s.start("Extracting schema...");
  const schema = await extractSchema(context);
  s.stop(
    schema
      ? `Schema source: ${schema.source}`
      : "No schema found (skill will warn).",
  );

  s.start("Scanning for query patterns...");
  const queryPatterns = await extractQueryPatterns(context);
  s.stop(`Captured ${queryPatterns.length} query patterns.`);

  let routes: ApiRoute[] = [];
  if (skillName === "api-endpoint-explorer" || skillName === "auth-map") {
    s.start("Scanning for HTTP routes...");
    routes = await extractApiRoutes(context);
    s.stop(`Captured ${routes.length} routes.`);
  }

  let auth: AuthReport | undefined;
  if (skillName === "auth-map") {
    s.start("Scanning for auth markers...");
    auth = await extractAuth(context);
    s.stop(
      `Captured ${auth.middlewares.length} auth markers / ${auth.roleConstants.length} role constants.`,
    );
  }

  let ci: CiReport | undefined;
  if (skillName === "ci-pipeline") {
    s.start("Scanning CI workflows...");
    ci = await extractCi(context);
    s.stop(
      `Captured ${ci.jobs.length} job(s) across ${ci.systems.length} CI system(s).`,
    );
  }

  s.start("Synthesizing skill...");
  const synthesisInputs: Parameters<typeof buildSynthesisVars>[0] = {
    context,
    schema,
    queryPatterns,
    routes,
    routingStyle: routingStyleFor(context.framework),
  };
  if (auth) synthesisInputs.auth = auth;
  if (ci) synthesisInputs.ci = ci;
  const vars = buildSynthesisVars(synthesisInputs);
  const synthesizedMarkdown = applyTemplate(template.markdown, vars);
  s.stop("Synthesis complete.");

  s.start("Writing files...");
  const skillDir = path.join(context.root, ".agents", "skills", skillName);
  await fs.ensureDir(skillDir);
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    synthesizedMarkdown,
    "utf8",
  );

  if (Object.keys(template.references).length > 0) {
    const refDir = path.join(skillDir, "references");
    await fs.ensureDir(refDir);
    for (const [name, body] of Object.entries(template.references)) {
      await fs.writeFile(
        path.join(refDir, name),
        applyTemplate(body, vars),
        "utf8",
      );
    }
  }

  if (Object.keys(template.scripts).length > 0) {
    const scriptDir = path.join(skillDir, "scripts");
    await fs.ensureDir(scriptDir);
    for (const [name, body] of Object.entries(template.scripts)) {
      await fs.writeFile(path.join(scriptDir, name), body, "utf8");
    }
  }

  if (schema) {
    const refDir = path.join(skillDir, "references");
    await fs.ensureDir(refDir);
    const ext = guessSchemaExtension(schema.dialect);
    await fs.writeFile(
      path.join(refDir, `schema${ext}`),
      schema.content,
      "utf8",
    );
  }

  if (routes.length > 0) {
    const refDir = path.join(skillDir, "references");
    await fs.ensureDir(refDir);
    await fs.writeJson(path.join(refDir, "routes.json"), routes, { spaces: 2 });
  }

  if (auth) {
    const refDir = path.join(skillDir, "references");
    await fs.ensureDir(refDir);
    await fs.writeJson(
      path.join(refDir, "auth.json"),
      {
        middlewares: auth.middlewares,
        roleConstants: auth.roleConstants,
        routeFilesWithAuth: [...auth.routeFilesWithAuth].sort(),
      },
      { spaces: 2 },
    );
  }

  if (ci) {
    const refDir = path.join(skillDir, "references");
    await fs.ensureDir(refDir);
    await fs.writeJson(path.join(refDir, "ci.json"), ci, { spaces: 2 });
  }

  s.stop(`Wrote ${path.relative(context.root, skillDir)}`);

  outro(`Ready. ${skillName} is live for Claude Code, Copilot, and Cursor.`);
}

function guessSchemaExtension(dialect: string): string {
  switch (dialect) {
    case "prisma":
      return ".prisma";
    case "drizzle":
    case "typeorm":
    case "sequelize":
    case "mongoose":
    case "raw-mongo":
    case "knex":
      return ".ts";
    case "sqlalchemy":
    case "django-orm":
      return ".py";
    case "active-record":
      return ".rb";
    case "gorm":
      return ".go";
    case "raw-sql":
      return ".sql";
    default:
      return ".txt";
  }
}
