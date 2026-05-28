import { describe, expect, it } from "vitest";

// Exercise the real module (no mock) so the client construction + dev-mode
// global caching are covered. Construction is lazy and does not open a
// connection, so this is safe without a live database.
import { prisma } from "@/server/db";

describe("prisma client", () => {
  it("exposes a constructed Prisma client with the app's models", () => {
    expect(prisma).toBeDefined();
    expect(prisma.user).toBeDefined();
    expect(prisma.campaign).toBeDefined();
    expect(prisma.membership).toBeDefined();
  });

  it("caches the client on globalThis outside production", () => {
    const cached = (globalThis as { prisma?: unknown }).prisma;
    expect(cached).toBe(prisma);
  });
});
