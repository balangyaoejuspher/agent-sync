import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  tags?: string[];
  files?: string[];
  requires?: {
    orm?: string[];
    framework?: string[];
    language?: string[];
  };
}

export interface SkillTemplate {
  name: string;
  manifest: SkillManifest;
  markdown: string;
  references: Record<string, string>;
  scripts: Record<string, string>;
  source: "remote" | "cache" | "bundled";
}

export interface RegistryOptions {
  remoteBase?: string;
  cacheDir?: string;
  offline?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_REMOTE_BASE =
  'https://raw.githubusercontent.com/balangyaoejuspher/agent-sync/main/templates/skills';

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

function defaultCacheDir(): string {
  return path.join(os.homedir(), ".cache", "agent-sync", "registry");
}

export async function listBundledSkills(): Promise<SkillManifest[]> {
  const root = path.join(bundledTemplatesDir(), "skills");
  if (!(await fs.pathExists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const out: SkillManifest[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const manifestPath = path.join(root, e.name, "manifest.json");
    if (await fs.pathExists(manifestPath)) {
      const m = (await fs.readJson(manifestPath)) as SkillManifest;
      out.push(m);
    }
  }
  return out;
}

async function loadFromDir(
  skillName: string,
  dir: string,
  source: SkillTemplate["source"],
): Promise<SkillTemplate | null> {
  const manifestPath = path.join(dir, "manifest.json");
  const skillMdPath = path.join(dir, "SKILL.md");
  if (
    !(await fs.pathExists(manifestPath)) ||
    !(await fs.pathExists(skillMdPath))
  )
    return null;

  const manifest = (await fs.readJson(manifestPath)) as SkillManifest;
  const markdown = await fs.readFile(skillMdPath, "utf8");
  const references = await readDirAsMap(path.join(dir, "references"));
  const scripts = await readDirAsMap(path.join(dir, "scripts"));
  return { name: skillName, manifest, markdown, references, scripts, source };
}

async function readDirAsMap(dir: string): Promise<Record<string, string>> {
  if (!(await fs.pathExists(dir))) return {};
  const out: Record<string, string> = {};
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    out[e.name] = await fs.readFile(path.join(dir, e.name), "utf8");
  }
  return out;
}

async function fetchText(
  url: string,
  timeoutMs = 4000,
): Promise<string | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(url, { redirect: "follow", signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function downloadSkillToCache(
  skillName: string,
  remoteBase: string,
  cacheDir: string,
): Promise<string | null> {
  const base = remoteBase.replace(/\/+$/, "");
  const manifestUrl = `${base}/${encodeURIComponent(skillName)}/manifest.json`;
  const manifestRaw = await fetchText(manifestUrl);
  if (manifestRaw === null) return null;

  let manifest: SkillManifest;
  try {
    manifest = JSON.parse(manifestRaw) as SkillManifest;
  } catch {
    return null;
  }

  const skillMdUrl = `${base}/${encodeURIComponent(skillName)}/SKILL.md`;
  const skillMd = await fetchText(skillMdUrl);
  if (skillMd === null) return null;

  const skillCacheDir = path.join(cacheDir, skillName);
  await fs.ensureDir(skillCacheDir);
  await fs.writeFile(
    path.join(skillCacheDir, "manifest.json"),
    manifestRaw,
    "utf8",
  );
  await fs.writeFile(path.join(skillCacheDir, "SKILL.md"), skillMd, "utf8");

  const extraFiles = manifest.files ?? [];
  for (const rel of extraFiles) {
    if (rel.includes("..") || path.isAbsolute(rel)) continue;
    const url = `${base}/${encodeURIComponent(skillName)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
    const body = await fetchText(url);
    if (body === null) continue;
    const destFile = path.join(skillCacheDir, rel);
    await fs.ensureDir(path.dirname(destFile));
    await fs.writeFile(destFile, body, "utf8");
  }

  return skillCacheDir;
}

export async function fetchRemoteSkillTemplate(
  skillName: string,
  opts: RegistryOptions = {},
): Promise<SkillTemplate> {
  const remoteBase =
    opts.remoteBase ??
    process.env["AGENT_SYNC_REGISTRY"] ??
    DEFAULT_REMOTE_BASE;
  const cacheDir = opts.cacheDir ?? defaultCacheDir();
  const offline = opts.offline ?? false;

  if (!offline) {
    const cachedPath = await downloadSkillToCache(
      skillName,
      remoteBase,
      cacheDir,
    );
    if (cachedPath) {
      const t = await loadFromDir(skillName, cachedPath, "remote");
      if (t) return t;
    }
  }

  const cachedDir = path.join(cacheDir, skillName);
  if (await fs.pathExists(cachedDir)) {
    const t = await loadFromDir(skillName, cachedDir, "cache");
    if (t) return t;
  }

  const bundled = path.join(bundledTemplatesDir(), "skills", skillName);
  if (await fs.pathExists(bundled)) {
    const t = await loadFromDir(skillName, bundled, "bundled");
    if (t) return t;
  }

  throw new Error(
    `Skill "${skillName}" not found in registry (${remoteBase}), local cache, or bundled templates. Run \`agent-sync list\` to see available skills.`,
  );
}
