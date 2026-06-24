import fs from "fs-extra";
import path from "node:path";
import { globby } from "globby";

export type Language =
  | "typescript"
  | "javascript"
  | "python"
  | "ruby"
  | "go"
  | "unknown";
export type Framework =
  | "nextjs"
  | "express"
  | "fastify"
  | "nestjs"
  | "fastapi"
  | "django"
  | "flask"
  | "rails"
  | "unknown";
export type Orm =
  | "prisma"
  | "drizzle"
  | "typeorm"
  | "sequelize"
  | "mongoose"
  | "raw-mongo"
  | "knex"
  | "sqlalchemy"
  | "django-orm"
  | "active-record"
  | "gorm"
  | "raw-sql"
  | "none";

export interface ProjectContext {
  root: string;
  language: Language;
  framework: Framework;
  orm: Orm;
  packageManager:
    | "npm"
    | "pnpm"
    | "yarn"
    | "bun"
    | "pip"
    | "poetry"
    | "bundler"
    | "unknown";
  hints: {
    hasTsConfig: boolean;
    hasPackageJson: boolean;
    hasPrismaSchema: boolean;
    hasRequirementsTxt: boolean;
    hasPyprojectToml: boolean;
    hasGemfile: boolean;
    sqlMigrationDirs: string[];
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe<T = unknown>(file: string): Promise<T | null> {
  try {
    return (await fs.readJson(file)) as T;
  } catch {
    return null;
  }
}

async function detectLanguage(
  root: string,
  hints: ProjectContext["hints"],
): Promise<Language> {
  if (hints.hasTsConfig) return "typescript";
  if (hints.hasPackageJson) return "javascript";
  if (hints.hasRequirementsTxt || hints.hasPyprojectToml) return "python";
  if (hints.hasGemfile) return "ruby";
  if (await exists(path.join(root, "go.mod"))) return "go";
  return "unknown";
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function flatDeps(pkg: PackageJson | null): Record<string, string> {
  if (!pkg) return {};
  return {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
  };
}

async function detectNodeFramework(
  deps: Record<string, string>,
): Promise<Framework> {
  if (deps["next"]) return "nextjs";
  if (deps["@nestjs/core"]) return "nestjs";
  if (deps["fastify"]) return "fastify";
  if (deps["express"]) return "express";
  return "unknown";
}

async function detectPythonFramework(root: string): Promise<Framework> {
  const candidates = await globby(
    ["**/manage.py", "**/asgi.py", "**/wsgi.py", "**/main.py", "**/app.py"],
    { cwd: root, gitignore: true, dot: false, deep: 3, absolute: true },
  );
  for (const file of candidates) {
    const base = path.basename(file);
    if (base === "manage.py") return "django";
    const src = await fs.readFile(file, "utf8").catch(() => "");
    if (/from\s+fastapi\s+import|FastAPI\s*\(/.test(src)) return "fastapi";
    if (/from\s+flask\s+import|Flask\s*\(__name__\)/.test(src)) return "flask";
    if (/from\s+django/.test(src)) return "django";
  }
  return "unknown";
}

async function detectOrm(
  root: string,
  language: Language,
  framework: Framework,
  deps: Record<string, string>,
  hints: ProjectContext["hints"],
): Promise<Orm> {
  if (hints.hasPrismaSchema || deps["@prisma/client"] || deps["prisma"])
    return "prisma";
  if (deps["drizzle-orm"]) return "drizzle";
  if (deps["typeorm"]) return "typeorm";
  if (deps["sequelize"]) return "sequelize";
  if (deps["mongoose"]) return "mongoose";
  if (deps["knex"] || deps["objection"]) return "knex";
  if (deps["mongodb"]) return "raw-mongo";

  if (language === "python") {
    if (framework === "django") return "django-orm";
    const pyFiles = await globby(["**/*.py"], {
      cwd: root,
      gitignore: true,
      deep: 4,
      absolute: true,
      ignore: ["**/.venv/**", "**/venv/**", "**/site-packages/**"],
    });
    for (const f of pyFiles.slice(0, 200)) {
      const src = await fs.readFile(f, "utf8").catch(() => "");
      if (/from\s+sqlalchemy/.test(src) || /declarative_base\s*\(/.test(src))
        return "sqlalchemy";
    }
  }

  if (hints.hasGemfile) {
    const gemfile = await fs
      .readFile(path.join(root, "Gemfile"), "utf8")
      .catch(() => "");
    if (/\bgem\s+["']rails["']/.test(gemfile)) return "active-record";
  }

  if (language === "go") {
    const goFiles = await globby(["**/*.go"], {
      cwd: root,
      gitignore: true,
      deep: 4,
      absolute: true,
      ignore: ["**/vendor/**"],
    });
    for (const f of goFiles.slice(0, 200)) {
      const src = await fs.readFile(f, "utf8").catch(() => "");
      if (
        /gorm\.io\/gorm/.test(src) ||
        /jinzhu\/gorm/.test(src) ||
        /`gorm:"/.test(src)
      ) {
        return "gorm";
      }
    }
  }

  if (
    (language === "javascript" || language === "typescript") &&
    !deps["mongoose"] &&
    !deps["mongodb"]
  ) {
    const jsFiles = await globby(
      ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
      {
        cwd: root,
        gitignore: true,
        absolute: true,
        ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
      },
    );
    for (const f of jsFiles.slice(0, 200)) {
      const src = await fs.readFile(f, "utf8").catch(() => "");
      if (/require\s*\(\s*['"]mongodb['"]\s*\)|from\s+['"]mongodb['"]/.test(src)) {
        return "raw-mongo";
      }
    }
  }

  if (hints.sqlMigrationDirs.length > 0) return "raw-sql";
  return "none";
}

async function detectPackageManager(
  root: string,
  language: Language,
): Promise<ProjectContext["packageManager"]> {
  if (language === "typescript" || language === "javascript") {
    if (await exists(path.join(root, "bun.lockb"))) return "bun";
    if (await exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
    if (await exists(path.join(root, "yarn.lock"))) return "yarn";
    return "npm";
  }
  if (language === "python") {
    if (await exists(path.join(root, "poetry.lock"))) return "poetry";
    return "pip";
  }
  if (language === "ruby") return "bundler";
  return "unknown";
}

async function findSqlMigrationDirs(root: string): Promise<string[]> {
  const matches = await globby(
    ["**/migrations/**/*.sql", "**/db/migrate/**/*.rb"],
    {
      cwd: root,
      gitignore: true,
      deep: 5,
      onlyFiles: true,
    },
  );
  const dirs = new Set<string>();
  for (const m of matches) dirs.add(path.dirname(m));
  return [...dirs];
}

export async function detectProjectContext(
  targetDir: string,
): Promise<ProjectContext> {
  const root = path.resolve(targetDir);

  const hints: ProjectContext["hints"] = {
    hasTsConfig: await exists(path.join(root, "tsconfig.json")),
    hasPackageJson: await exists(path.join(root, "package.json")),
    hasPrismaSchema: await exists(path.join(root, "prisma", "schema.prisma")),
    hasRequirementsTxt: await exists(path.join(root, "requirements.txt")),
    hasPyprojectToml: await exists(path.join(root, "pyproject.toml")),
    hasGemfile: await exists(path.join(root, "Gemfile")),
    sqlMigrationDirs: await findSqlMigrationDirs(root),
  };

  const language = await detectLanguage(root, hints);
  const pkg = hints.hasPackageJson
    ? await readJsonSafe<PackageJson>(path.join(root, "package.json"))
    : null;
  const deps = flatDeps(pkg);

  let framework: Framework = "unknown";
  if (language === "typescript" || language === "javascript") {
    framework = await detectNodeFramework(deps);
  } else if (language === "python") {
    framework = await detectPythonFramework(root);
  } else if (language === "ruby") {
    if (hints.hasGemfile) {
      const gemfile = await fs
        .readFile(path.join(root, "Gemfile"), "utf8")
        .catch(() => "");
      if (/\bgem\s+["']rails["']/.test(gemfile)) framework = "rails";
    }
  }

  const orm = await detectOrm(root, language, framework, deps, hints);
  const packageManager = await detectPackageManager(root, language);

  return { root, language, framework, orm, packageManager, hints };
}
