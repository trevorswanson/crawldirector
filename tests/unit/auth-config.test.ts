import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, compare } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: { user: { findUnique } },
}));

vi.mock("bcryptjs", () => ({
  default: { compare },
}));

import {
  authorizeCredentials,
  jwtCallback,
  sessionCallback,
} from "@/server/auth/config";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authorizeCredentials", () => {
  const creds = { email: "carl@example.com", password: "secret-pass" };

  it("returns null for input that fails validation", async () => {
    expect(await authorizeCredentials({ email: "nope", password: "" })).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the user has no password hash (or doesn't exist)", async () => {
    findUnique.mockResolvedValue(null);
    expect(await authorizeCredentials(creds)).toBeNull();

    findUnique.mockResolvedValue({ id: "u1", passwordHash: null });
    expect(await authorizeCredentials(creds)).toBeNull();
    expect(compare).not.toHaveBeenCalled();
  });

  it("returns null when the password does not match", async () => {
    findUnique.mockResolvedValue({ id: "u1", passwordHash: "hash" });
    compare.mockResolvedValue(false);
    expect(await authorizeCredentials(creds)).toBeNull();
  });

  it("returns the user identity on a correct password", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      email: creds.email,
      name: "Carl",
      passwordHash: "hash",
    });
    compare.mockResolvedValue(true);

    expect(await authorizeCredentials(creds)).toEqual({
      id: "u1",
      email: creds.email,
      name: "Carl",
    });
    expect(compare).toHaveBeenCalledWith(creds.password, "hash");
  });
});

describe("jwtCallback", () => {
  it("copies the user id onto the token at sign-in", () => {
    expect(jwtCallback({ token: {}, user: { id: "u1" } as never })).toEqual({
      id: "u1",
    });
  });

  it("leaves the token untouched on subsequent calls", () => {
    expect(jwtCallback({ token: { id: "u1" } })).toEqual({ id: "u1" });
  });
});

describe("sessionCallback", () => {
  it("exposes the token id on the session user", () => {
    const session = { user: { id: "" } } as never;
    const result = sessionCallback({ session, token: { id: "u1" } });
    expect(result.user.id).toBe("u1");
  });

  it("leaves the session user id when the token has none", () => {
    const session = { user: { id: "orig" } } as never;
    const result = sessionCallback({ session, token: {} });
    expect(result.user.id).toBe("orig");
  });
});

describe("oidc configuration (env-driven)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is disabled and defaults the SSO name when env vars are absent", async () => {
    vi.stubEnv("AUTH_OIDC_ISSUER", "");
    vi.stubEnv("AUTH_OIDC_ID", "");
    vi.stubEnv("AUTH_OIDC_SECRET", "");
    vi.stubEnv("AUTH_OIDC_NAME", undefined);
    vi.resetModules();

    const mod = await import("@/server/auth/config");
    expect(mod.oidcEnabled).toBe(false);
    expect(mod.oidcProvider.name).toBe("SSO");
  });

  it("is enabled and uses the configured name when env vars are present", async () => {
    vi.stubEnv("AUTH_OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("AUTH_OIDC_ID", "client-id");
    vi.stubEnv("AUTH_OIDC_SECRET", "client-secret");
    vi.stubEnv("AUTH_OIDC_NAME", "Authentik");
    vi.resetModules();

    const mod = await import("@/server/auth/config");
    expect(mod.oidcEnabled).toBe(true);
    expect(mod.oidcProvider.name).toBe("Authentik");
    expect((mod.oidcProvider as { issuer?: string }).issuer).toBe(
      "https://idp.example.com",
    );
  });
});
