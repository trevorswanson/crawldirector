// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EntityTypeahead, type EntityCandidate } from "@/components/entities/entity-typeahead";

afterEach(cleanup);

describe("EntityTypeahead", () => {
  it("searches remote candidates for typed queries and selects returned matches", async () => {
    const remoteCandidate: EntityCandidate = {
      id: "e2",
      name: "Princess Donut",
      type: "CRAWLER",
    };
    const searchCandidates = vi.fn().mockResolvedValue([remoteCandidate]);
    const onChange = vi.fn();

    render(
      <EntityTypeahead
        name="targetId"
        candidates={[{ id: "e1", name: "Carl", type: "CRAWLER" }]}
        value={null}
        onChange={onChange}
        searchCandidates={searchCandidates}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search entity…"), {
      target: { value: "donut" },
    });

    await waitFor(() => {
      expect(searchCandidates).toHaveBeenCalledWith("donut");
      expect(screen.getByRole("button", { name: /Princess Donut/ })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Princess Donut/ }));

    expect(onChange).toHaveBeenCalledWith(remoteCandidate);
  });
});
