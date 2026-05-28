import { beforeEach, describe, expect, it, vi } from "vitest";

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));

vi.mock("@/server/auth", () => ({ signIn }));

import { signInWithOidc } from "@/app/(auth)/oauth-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signInWithOidc", () => {
  it("starts the oidc sign-in flow and lands on the dashboard", async () => {
    await signInWithOidc();
    expect(signIn).toHaveBeenCalledWith("oidc", { redirectTo: "/dashboard" });
  });
});
