// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { useActionState, useFormStatus } = vi.hoisted(() => ({
  useActionState: vi.fn(),
  useFormStatus: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState,
}));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}));

import { CredentialsForm } from "@/components/auth/credentials-form";

const noopAction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useActionState.mockReturnValue([undefined, noopAction]);
  useFormStatus.mockReturnValue({ pending: false });
});

afterEach(cleanup);

describe("CredentialsForm", () => {
  it("shows the name field and 'Create account' button in sign-up mode", () => {
    render(<CredentialsForm mode="sign-up" action={noopAction} />);
    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDefined();
  });

  it("omits the name field and shows 'Sign in' in sign-in mode", () => {
    render(<CredentialsForm mode="sign-in" action={noopAction} />);
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
  });

  it("renders the error alert when the action state carries an error", () => {
    useActionState.mockReturnValue([{ error: "Bad credentials" }, noopAction]);
    render(<CredentialsForm mode="sign-in" action={noopAction} />);
    expect(screen.getByRole("alert").textContent).toBe("Bad credentials");
  });

  it("disables the submit button and shows a pending label while submitting", () => {
    useFormStatus.mockReturnValue({ pending: true });
    render(<CredentialsForm mode="sign-in" action={noopAction} />);
    const btn = screen.getByRole("button", { name: "Please wait…" });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });
});
