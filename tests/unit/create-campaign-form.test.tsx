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
// Avoid pulling the server action (and its server-only deps) into the render.
vi.mock("@/app/(dm)/actions", () => ({ createCampaignAction: vi.fn() }));

import { CreateCampaignForm } from "@/components/campaigns/create-campaign-form";

const noopAction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useActionState.mockReturnValue([undefined, noopAction]);
  useFormStatus.mockReturnValue({ pending: false });
});

afterEach(cleanup);

describe("CreateCampaignForm", () => {
  it("renders the name and summary fields and the create button", () => {
    render(<CreateCampaignForm />);
    expect(screen.getByLabelText("Crawl name")).toBeDefined();
    expect(screen.getByLabelText("Summary (optional)")).toBeDefined();
    expect(screen.getByRole("button", { name: "Create crawl" })).toBeDefined();
  });

  it("renders the seedLore checkbox unchecked with the correct name", () => {
    render(<CreateCampaignForm />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.name).toBe("seedLore");
    expect(checkbox.checked).toBe(false);
    // No explicit value attribute; browser defaults to "on" when checked — correct per spec
    expect(checkbox.hasAttribute("value")).toBe(false);
  });

  it("shows the error alert from the action state", () => {
    useActionState.mockReturnValue([{ error: "Nope" }, noopAction]);
    render(<CreateCampaignForm />);
    expect(screen.getByRole("alert").textContent).toBe("Nope");
  });

  it("shows the pending label and disables the button while submitting", () => {
    useFormStatus.mockReturnValue({ pending: true });
    render(<CreateCampaignForm />);
    const btn = screen.getByRole("button", { name: "Creating…" });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });
});
