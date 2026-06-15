// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { enqueueBuildSemanticIndexAction, mockUseActionState, mockUseFormStatus } = vi.hoisted(
  () => ({
    enqueueBuildSemanticIndexAction: vi.fn(),
    mockUseActionState: vi.fn(),
    mockUseFormStatus: vi.fn(),
  }),
);

vi.mock("@/app/(dm)/actions", () => ({ enqueueBuildSemanticIndexAction }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});
vi.mock("react-dom", async (orig) => {
  const actual = await orig<typeof import("react-dom")>();
  return { ...actual, useFormStatus: mockUseFormStatus };
});

import { BuildSemanticIndexButton } from "@/components/search/build-semantic-index-button";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn(), false]);
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => cleanup());

describe("BuildSemanticIndexButton", () => {
  it("renders the submit button", () => {
    render(<BuildSemanticIndexButton campaignId="c1" />);
    expect(screen.getByRole("button", { name: /build semantic index/i })).toBeTruthy();
  });

  it("shows a queuing label while pending", () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    render(<BuildSemanticIndexButton campaignId="c1" />);
    const button = screen.getByRole("button");
    expect(button.textContent).toMatch(/queuing/i);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the success message after a successful enqueue", () => {
    mockUseActionState.mockReturnValue([
      { success: "Semantic index build queued — search will rank by meaning once the worker finishes." },
      vi.fn(),
      false,
    ]);
    render(<BuildSemanticIndexButton campaignId="c1" />);
    expect(screen.getByText(/Semantic index build queued/i)).toBeTruthy();
  });

  it("shows an error message in an alert", () => {
    mockUseActionState.mockReturnValue([
      { error: "No embedding-capable provider is configured." },
      vi.fn(),
      false,
    ]);
    render(<BuildSemanticIndexButton campaignId="c1" />);
    expect(screen.getByRole("alert").textContent).toMatch(/No embedding-capable/i);
  });
});
