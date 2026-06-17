// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { EntityTypeahead, type EntityCandidate } from "@/components/entities/entity-typeahead";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Flush the microtask queue so resolved promises settle under fake timers.
const flushPromises = () => act(() => Promise.resolve());

describe("EntityTypeahead", () => {
  it("searches remote candidates after the debounce delay and selects returned matches", async () => {
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

    // The server action should not fire immediately (debounced).
    expect(searchCandidates).not.toHaveBeenCalled();

    // Advance past the 250ms debounce and let the resolved promise settle.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await flushPromises();

    expect(searchCandidates).toHaveBeenCalledWith("donut");
    expect(screen.getByRole("button", { name: /Princess Donut/ })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Princess Donut/ }));

    expect(onChange).toHaveBeenCalledWith(remoteCandidate);
  });

  it("coalesces rapid keystrokes into a single server call", async () => {
    const searchCandidates = vi.fn().mockResolvedValue([]);
    const onChange = vi.fn();

    render(
      <EntityTypeahead
        name="targetId"
        candidates={[]}
        value={null}
        onChange={onChange}
        searchCandidates={searchCandidates}
      />,
    );

    const input = screen.getByLabelText("Search entity…");

    // Simulate rapid typing: each keystroke within 100ms, well under the 250ms
    // debounce window. Only the final value should fire a server call.
    for (const partial of ["d", "do", "don", "donu", "donut"]) {
      fireEvent.change(input, { target: { value: partial } });
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
    }

    // Advance past the debounce window for the final keystroke.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    // Let the pending promise from the last debounce settle.
    await flushPromises();

    expect(searchCandidates).toHaveBeenCalledTimes(1);
    expect(searchCandidates).toHaveBeenCalledWith("donut");
  });
});


