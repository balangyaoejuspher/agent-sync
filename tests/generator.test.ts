import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { detectProjectContext } from "../src/core/detector.js";
import {
  applyTemplate,
  buildSynthesisVars,
  extractApiRoutes,
  extractAuth,
  extractCi,
  extractQueryPatterns,
  extractSchema,
} from "../src/core/generator.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FX = path.resolve(here, "fixtures");

describe("generator extractors", () => {
  it("extracts a Prisma schema and query patterns", async () => {
    const ctx = await detectProjectContext(path.join(FX, "nextjs-prisma"));
    const schema = await extractSchema(ctx);
    expect(schema).not.toBeNull();
    expect(schema!.dialect).toBe("prisma");
    expect(schema!.content).toContain("model User");

    const patterns = await extractQueryPatterns(ctx);
    const snippets = patterns.map((p) => p.snippet);
    expect(snippets).toContain("prisma.user.findUnique");
    expect(snippets).toContain("prisma.post.findMany");
  });

  it("captures Express routes and parses Next.js app-router files", async () => {
    const exp = await detectProjectContext(path.join(FX, "express-mongoose"));
    const expRoutes = await extractApiRoutes(exp);
    const ePaths = expRoutes.map((r) => `${r.method} ${r.path}`);
    expect(ePaths).toContain("GET /health");
    expect(ePaths).toContain("GET /users");
    expect(ePaths).toContain("POST /users");
    expect(ePaths).toContain("DELETE /users/:id");

    const nx = await detectProjectContext(path.join(FX, "nextjs-prisma"));
    const nxRoutes = await extractApiRoutes(nx);
    const nxPaths = nxRoutes.map((r) => `${r.method} ${r.path}`);
    expect(nxPaths).toContain("GET /api/users/:id");
    expect(nxPaths).toContain("POST /api/users/:id");
  });

  it("captures Django path() and re_path()", async () => {
    const ctx = await detectProjectContext(path.join(FX, "django"));
    const routes = await extractApiRoutes(ctx);
    const paths = routes.map((r) => r.path);
    expect(paths).toContain("/books/");
    expect(paths.some((p) => p.startsWith("/authors/"))).toBe(true);
  });

  it("flags auth middleware usage", async () => {
    const ctx = await detectProjectContext(path.join(FX, "express-mongoose"));
    const auth = await extractAuth(ctx);
    expect(auth.middlewares.some((m) => m.snippet === "requireAuth")).toBe(true);
    expect(auth.routeFilesWithAuth.size).toBeGreaterThan(0);
  });

  it("parses a GitHub Actions workflow file", async () => {
    const ctx = await detectProjectContext(path.join(FX, "express-mongoose"));
    const ci = await extractCi(ctx);
    expect(ci.systems).toContain("github-actions");
    expect(ci.jobs.some((j) => j.name === "test")).toBe(true);
    expect(ci.secrets).toContain("MY_SECRET");
  });

  it("applies template placeholders", () => {
    const out = applyTemplate("hello {{NAME}}, lang={{LANG}}", {
      NAME: "world",
      LANG: "ts",
    });
    expect(out).toBe("hello world, lang=ts");
  });

  it("produces synthesis vars for a Prisma project", async () => {
    const ctx = await detectProjectContext(path.join(FX, "nextjs-prisma"));
    const schema = await extractSchema(ctx);
    const queryPatterns = await extractQueryPatterns(ctx);
    const vars = buildSynthesisVars({ context: ctx, schema, queryPatterns });
    expect(vars.PROJECT_FRAMEWORK).toBe("nextjs");
    expect(vars.DB_DIALECT).toBe("prisma");
    expect(vars.DB_SCHEMA_CONTEXT).toContain("model User");
    expect(vars.QUERY_PATTERNS).toContain("prisma.user.findUnique");
  });
});
