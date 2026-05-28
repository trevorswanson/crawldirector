// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// These pages import "use server" actions that transitively load NextAuth
// (and thus next/server, unresolvable under vitest). Stub those boundaries so
// the test exercises only the page's own rendering/branching.
vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
}));
vi.mock("@/app/(auth)/oauth-actions", () => ({ signInWithOidc: vi.fn() }));
vi.mock("@/components/auth/credentials-form", () => ({
  CredentialsForm: ({ mode }: { mode: string }) => (
    <div data-testid="credentials-form">{mode}</div>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import SignInPage from "@/app/(auth)/sign-in/page";
import SignUpPage from "@/app/(auth)/sign-up/page";

function disableOidc() {
  vi.stubEnv("AUTH_OIDC_ISSUER", "");
  vi.stubEnv("AUTH_OIDC_ID", "");
  vi.stubEnv("AUTH_OIDC_SECRET", "");
}
function enableOidc() {
  vi.stubEnv("AUTH_OIDC_ISSUER", "https://idp.example.com");
  vi.stubEnv("AUTH_OIDC_ID", "id");
  vi.stubEnv("AUTH_OIDC_SECRET", "secret");
  vi.stubEnv("AUTH_OIDC_NAME", "Authentik");
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("SignInPage", () => {
  it("renders the sign-in form without an SSO button when oidc is off", () => {
    disableOidc();
    render(<SignInPage />);
    expect(screen.getByText("Sign in")).toBeDefined();
    expect(screen.getByTestId("credentials-form").textContent).toBe("sign-in");
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  it("shows the SSO button labelled with the provider name when oidc is on", () => {
    enableOidc();
    render(<SignInPage />);
    expect(
      screen.getByRole("button", { name: "Continue with Authentik" }),
    ).toBeDefined();
  });
});

describe("SignUpPage", () => {
  it("renders the sign-up form without an SSO button when oidc is off", () => {
    disableOidc();
    render(<SignUpPage />);
    expect(screen.getByText("Create your account")).toBeDefined();
    expect(screen.getByTestId("credentials-form").textContent).toBe("sign-up");
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  it("shows the SSO button when oidc is on", () => {
    enableOidc();
    render(<SignUpPage />);
    expect(
      screen.getByRole("button", { name: "Continue with Authentik" }),
    ).toBeDefined();
  });
});
