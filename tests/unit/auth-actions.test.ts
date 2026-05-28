import { beforeEach, describe, expect, it, vi } from "vitest";

// A minimal stand-in for next-auth's AuthError so `instanceof` works in tests.
const { signIn, registerUser, AuthError } = vi.hoisted(() => {
  class AuthError extends Error {}
  return { signIn: vi.fn(), registerUser: vi.fn(), AuthError };
});

vi.mock("@/server/auth", () => ({ signIn }));
vi.mock("@/server/services/accounts", () => ({ registerUser }));
vi.mock("next-auth", () => ({ AuthError }));

import { signInAction, signUpAction } from "@/app/(auth)/actions";
import { ServiceError } from "@/lib/errors";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const redirectError = Object.assign(new Error("redirect"), {
  digest: "NEXT_REDIRECT;replace;/dashboard;307;",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signUpAction", () => {
  const valid = {
    name: "Carl",
    email: "carl@example.com",
    password: "hunter2hunter2",
  };

  it("returns a validation error for bad input", async () => {
    const result = await signUpAction(undefined, form({ name: "", email: "x", password: "y" }));
    expect(result?.error).toBeTruthy();
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("registers then signs in on the happy path (rethrows the redirect)", async () => {
    registerUser.mockResolvedValue({ id: "u1" });
    signIn.mockRejectedValue(redirectError);

    await expect(signUpAction(undefined, form(valid))).rejects.toBe(redirectError);
    expect(registerUser).toHaveBeenCalledWith(valid);
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: valid.email,
      password: valid.password,
      redirectTo: "/dashboard",
    });
  });

  it("surfaces a ServiceError message", async () => {
    registerUser.mockRejectedValue(new ServiceError("Email taken"));
    const result = await signUpAction(undefined, form(valid));
    expect(result?.error).toBe("Email taken");
  });

  it("returns a generic message for unexpected errors", async () => {
    registerUser.mockRejectedValue(new Error("db down"));
    const result = await signUpAction(undefined, form(valid));
    expect(result?.error).toBe("Could not create your account. Please try again.");
  });
});

describe("signInAction", () => {
  const valid = { email: "carl@example.com", password: "secret" };

  it("returns a validation error for bad input", async () => {
    const result = await signInAction(undefined, form({ email: "nope", password: "" }));
    expect(result?.error).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rethrows the redirect thrown by a successful sign-in", async () => {
    signIn.mockRejectedValue(redirectError);
    await expect(signInAction(undefined, form(valid))).rejects.toBe(redirectError);
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: valid.email,
      password: valid.password,
      redirectTo: "/dashboard",
    });
  });

  it("maps an AuthError to an invalid-credentials message", async () => {
    signIn.mockRejectedValue(new AuthError("bad"));
    const result = await signInAction(undefined, form(valid));
    expect(result?.error).toBe("Invalid email or password.");
  });

  it("returns a generic message for unexpected errors", async () => {
    signIn.mockRejectedValue(new Error("boom"));
    const result = await signInAction(undefined, form(valid));
    expect(result?.error).toBe("Could not sign you in. Please try again.");
  });
});
