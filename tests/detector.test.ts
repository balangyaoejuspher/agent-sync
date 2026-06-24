import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { detectProjectContext } from "../src/core/detector.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FX = path.resolve(here, "fixtures");

describe("detectProjectContext", () => {
  it("identifies a Next.js + Prisma project", async () => {
    const ctx = await detectProjectContext(path.join(FX, "nextjs-prisma"));
    expect(ctx.language).toBe("typescript");
    expect(ctx.framework).toBe("nextjs");
    expect(ctx.orm).toBe("prisma");
    expect(ctx.packageManager).toBe("npm");
    expect(ctx.hints.hasPrismaSchema).toBe(true);
  });

  it("identifies an Express + Mongoose project", async () => {
    const ctx = await detectProjectContext(path.join(FX, "express-mongoose"));
    expect(ctx.language).toBe("javascript");
    expect(ctx.framework).toBe("express");
    expect(ctx.orm).toBe("mongoose");
  });

  it("identifies a Django project", async () => {
    const ctx = await detectProjectContext(path.join(FX, "django"));
    expect(ctx.language).toBe("python");
    expect(ctx.framework).toBe("django");
    expect(ctx.orm).toBe("django-orm");
    expect(ctx.packageManager).toBe("pip");
  });
});
