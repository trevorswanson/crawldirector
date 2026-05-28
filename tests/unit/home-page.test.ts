import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, redirect } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/server/auth/session", () => ({ getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect }));

import Home from "@/app/page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Home", () => {
  it("redirects signed-in users to the dashboard", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects anonymous visitors to sign-in", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });
});
