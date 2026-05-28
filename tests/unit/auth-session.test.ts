import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(() => {
    // next/navigation's redirect never returns — it throws a control-flow error.
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/server/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));

import { getCurrentUser, requireUser } from "@/server/auth/session";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns the session user when signed in", async () => {
    auth.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    expect(await getCurrentUser()).toEqual({ id: "u1", email: "a@b.c" });
  });

  it("returns null when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when the session has no user", async () => {
    auth.mockResolvedValue({});
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("requireUser", () => {
  it("returns the user without redirecting when signed in", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    expect(await requireUser()).toEqual({ id: "u1" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in when not signed in", async () => {
    auth.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });
});
