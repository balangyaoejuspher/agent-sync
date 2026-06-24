import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(here, "..", "dist", "index.js");

function ensureBuilt() {
  if (!fs.existsSync(CLI)) {
    execSync("npm run build", { cwd: path.resolve(here, ".."), stdio: "ignore" });
  }
}

function run(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const r = spawnSync("node", [CLI, ...args], { cwd, encoding: "utf8" });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

function copyFixture(name: string): string {
  const src = path.resolve(here, "fixtures", name);
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), `agent-sync-${name}-`));
  fs.cpSync(src, dst, { recursive: true });
  return dst;
}

describe("cli end-to-end", () => {
  beforeEach(() => ensureBuilt());

  let workdir: string | null = null;
  afterEach(() => {
    if (workdir && fs.existsSync(workdir)) fs.rmSync(workdir, { recursive: true, force: true });
    workdir = null;
  });

  it("init writes .agents/config.json with default targets", () => {
    workdir = copyFixture("nextjs-prisma");
    const r = run(["init", "--yes"], workdir);
    expect(r.status).toBe(0);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(workdir, ".agents", "config.json"), "utf8"),
    );
    expect(cfg.targets).toEqual(["claude", "copilot", "cursor"]);
    expect(cfg.context.framework).toBe("nextjs");
  });

  it("init --target persists a subset", () => {
    workdir = copyFixture("nextjs-prisma");
    const r = run(["init", "--yes", "--target", "claude,cursor"], workdir);
    expect(r.status).toBe(0);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(workdir, ".agents", "config.json"), "utf8"),
    );
    expect(cfg.targets).toEqual(["claude", "cursor"]);
  });

  it("add db-navigator synthesizes SKILL.md with the schema embedded", () => {
    workdir = copyFixture("nextjs-prisma");
    expect(run(["init", "--yes"], workdir).status).toBe(0);
    const r = run(["add", "db-navigator", "--offline"], workdir);
    expect(r.status).toBe(0);
    const skill = fs.readFileSync(
      path.join(workdir, ".agents", "skills", "db-navigator", "SKILL.md"),
      "utf8",
    );
    expect(skill).toContain("model User");
    expect(skill).toContain("prisma.user.findUnique");
  });

  it("compile honors the selected targets", () => {
    workdir = copyFixture("nextjs-prisma");
    expect(run(["init", "--yes", "--target", "claude"], workdir).status).toBe(0);
    expect(run(["add", "db-navigator", "--offline"], workdir).status).toBe(0);
    const r = run(["compile"], workdir);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(workdir, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(workdir, ".github", "copilot-instructions.md"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(workdir, ".cursor", "rules"))).toBe(false);
  });

  it("list shows all bundled skills", () => {
    workdir = copyFixture("nextjs-prisma");
    const r = run(["list"], workdir);
    expect(r.status).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/db-navigator/);
    expect(out).toMatch(/api-endpoint-explorer/);
    expect(out).toMatch(/auth-map/);
    expect(out).toMatch(/ci-pipeline/);
  });
});
