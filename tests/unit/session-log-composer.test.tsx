// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { searchEntityCandidatesAction } = vi.hoisted(() => ({
  searchEntityCandidatesAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ searchEntityCandidatesAction }));

import { SessionLogComposer } from "@/components/sessions/session-log-composer";
import type { EntityCandidate } from "@/components/entities/entity-typeahead";

const candidates: EntityCandidate[] = [{ id: "e1", name: "Carl", type: "CRAWLER" }];

beforeEach(() => {
  vi.clearAllMocks();
  searchEntityCandidatesAction.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe("SessionLogComposer", () => {
  it("submits the entry text via the bound action", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(<SessionLogComposer campaignId="c1" action={action} candidates={candidates} />);

    fireEvent.change(screen.getByLabelText("Log entry"), {
      target: { value: "Donut insulted the Maestro" },
    });
    fireEvent.click(screen.getByRole("button", { name: /log entry/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const [, formData] = action.mock.calls[0];
    expect(formData.get("text")).toBe("Donut insulted the Maestro");
  });

  it("submits tagged entity ids alongside the text", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(<SessionLogComposer campaignId="c1" action={action} candidates={candidates} />);

    fireEvent.change(screen.getByLabelText("Log entry"), { target: { value: "Tagged" } });
    fireEvent.change(screen.getByPlaceholderText("Tag an entity (optional)…"), {
      target: { value: "Carl" },
    });
    fireEvent.click(screen.getByText("Carl"));
    fireEvent.click(screen.getByRole("button", { name: /log entry/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const [, formData] = action.mock.calls[0];
    expect(formData.getAll("taggedIds")).toEqual(["e1"]);
  });

  it("shows a returned error and does not reset the form", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Log entry text is required." });
    render(<SessionLogComposer campaignId="c1" action={action} candidates={candidates} />);

    fireEvent.change(screen.getByLabelText("Log entry"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /log entry/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Log entry text is required."),
    );
    expect((screen.getByLabelText("Log entry") as HTMLTextAreaElement).value).toBe("x");
  });

  it("clears the text field and tag chips after a successful submit", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(<SessionLogComposer campaignId="c1" action={action} candidates={candidates} />);

    fireEvent.change(screen.getByLabelText("Log entry"), { target: { value: "Tagged" } });
    fireEvent.change(screen.getByPlaceholderText("Tag an entity (optional)…"), {
      target: { value: "Carl" },
    });
    fireEvent.click(screen.getByText("Carl"));
    expect(screen.getByLabelText("Remove Carl tag")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /log entry/i }));

    await waitFor(() =>
      expect((screen.getByLabelText("Log entry") as HTMLTextAreaElement).value).toBe(""),
    );
    expect(screen.queryByLabelText("Remove Carl tag")).toBeNull();
  });
});
