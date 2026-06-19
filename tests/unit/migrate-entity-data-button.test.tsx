// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { enqueueMigrateEntityDataAction, mockUseActionState, mockUseFormStatus } = vi.hoisted(
  () => ({
    enqueueMigrateEntityDataAction: vi.fn(),
    mockUseActionState: vi.fn(),
    mockUseFormStatus: vi.fn(),
  }),
);

vi.mock("@/app/(dm)/actions", () => ({ enqueueMigrateEntityDataAction }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});
vi.mock("react-dom", async (orig) => {
  const actual = await orig<typeof import("react-dom")>();
  return { ...actual, useFormStatus: mockUseFormStatus };
});

import { MigrateEntityDataButton } from "@/components/integrity/migrate-entity-data-button";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn(), false]);
  mockUseFormStatus.mockReturnValue({ pending: false });
});

afterEach(() => cleanup());

describe("MigrateEntityDataButton", () => {
  it("renders a DM-facing repair button", () => {
    render(<MigrateEntityDataButton campaignId="c1" />);
    expect(screen.getByRole("button", { name: /repair data versions/i })).toBeTruthy();
  });

  it("shows a queuing label while pending", () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    render(<MigrateEntityDataButton campaignId="c1" />);
    const button = screen.getByRole("button");
    expect(button.textContent).toMatch(/queuing repair/i);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the success message after a repair is queued", () => {
    mockUseActionState.mockReturnValue([
      {
        success: "Data repair queued — older saved entity details will update when the worker finishes.",
        activeJobStatus: "QUEUED",
      },
      vi.fn(),
      false,
    ]);
    render(<MigrateEntityDataButton campaignId="c1" />);
    expect(screen.getByText(/Data repair queued/i)).toBeTruthy();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button").textContent).toMatch(/repair queued/i);
  });

  it("shows an error message in an alert", () => {
    mockUseActionState.mockReturnValue([
      { error: "You do not have permission to manage jobs in this campaign." },
      vi.fn(),
      false,
    ]);
    render(<MigrateEntityDataButton campaignId="c1" />);
    expect(screen.getByRole("alert").textContent).toMatch(/permission/i);
  });

  it("disables repair while a data repair job is already active", () => {
    render(
      <MigrateEntityDataButton
        campaignId="c1"
        activeJob={{ id: "j1", status: "RUNNING", createdAt: new Date(), startedAt: new Date() }}
      />,
    );

    const button = screen.getByRole("button");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toMatch(/repair running/i);
    expect(screen.getByText(/Data repair is running/i)).toBeTruthy();
  });
});
