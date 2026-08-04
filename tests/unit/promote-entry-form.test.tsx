// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PromoteEntryForm } from "@/components/sessions/promote-entry-form";

afterEach(() => cleanup());

describe("PromoteEntryForm", () => {
  it("starts collapsed, expanding into a title form prefilled with the default title", () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(<PromoteEntryForm action={action} defaultTitle="Donut insulted the Maestro" />);

    expect(screen.queryByLabelText("Event title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /promote to event/i }));

    expect((screen.getByLabelText("Event title") as HTMLInputElement).value).toBe(
      "Donut insulted the Maestro",
    );
  });

  it("submits the (possibly edited) title via the bound action", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(<PromoteEntryForm action={action} defaultTitle="Default title" />);

    fireEvent.click(screen.getByRole("button", { name: /promote to event/i }));
    fireEvent.change(screen.getByLabelText("Event title"), {
      target: { value: "Floor 9 Breach" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const [, formData] = action.mock.calls[0];
    expect(formData.get("title")).toBe("Floor 9 Breach");
  });

  it("shows a returned error and keeps the form open", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Event title is required." });
    render(<PromoteEntryForm action={action} defaultTitle="Default title" />);

    fireEvent.click(screen.getByRole("button", { name: /promote to event/i }));
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Event title is required."),
    );
    expect(screen.getByLabelText("Event title")).toBeTruthy();
  });

  it("collapses back to the promote button on cancel", () => {
    const action = vi.fn();
    render(<PromoteEntryForm action={action} defaultTitle="Default title" />);

    fireEvent.click(screen.getByRole("button", { name: /promote to event/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByLabelText("Event title")).toBeNull();
    expect(screen.getByRole("button", { name: /promote to event/i })).toBeTruthy();
  });
});
