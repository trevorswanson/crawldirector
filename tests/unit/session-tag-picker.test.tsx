// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { searchEntityCandidatesAction } = vi.hoisted(() => ({
  searchEntityCandidatesAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ searchEntityCandidatesAction }));

import { SessionTagPicker } from "@/components/sessions/session-tag-picker";
import type { EntityCandidate } from "@/components/entities/entity-typeahead";

const candidates: EntityCandidate[] = [
  { id: "e1", name: "Carl", type: "CRAWLER" },
  { id: "e2", name: "Donut", type: "CRAWLER" },
];

beforeEach(() => {
  vi.clearAllMocks();
  searchEntityCandidatesAction.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe("SessionTagPicker", () => {
  it("picking a candidate adds a removable chip with a hidden taggedIds input", () => {
    const { container } = render(
      <SessionTagPicker campaignId="c1" candidates={candidates} />,
    );

    fireEvent.change(screen.getByPlaceholderText("Tag an entity (optional)…"), {
      target: { value: "Carl" },
    });
    fireEvent.click(screen.getByText("Carl"));

    expect(screen.getByText("Carl")).toBeTruthy();
    const hidden = container.querySelector('input[name="taggedIds"]') as HTMLInputElement;
    expect(hidden.value).toBe("e1");

    fireEvent.click(screen.getByLabelText("Remove Carl tag"));
    expect(container.querySelector('input[name="taggedIds"]')).toBeNull();
  });

  it("does not offer an already-tagged candidate again", async () => {
    render(<SessionTagPicker campaignId="c1" candidates={candidates} />);

    fireEvent.change(screen.getByPlaceholderText("Tag an entity (optional)…"), {
      target: { value: "Carl" },
    });
    fireEvent.click(screen.getByText("Carl"));

    fireEvent.change(screen.getByPlaceholderText("Tag an entity (optional)…"), {
      target: { value: "Carl" },
    });
    await waitFor(() => expect(screen.getByText(/No matching entities/)).toBeTruthy());
  });
});
