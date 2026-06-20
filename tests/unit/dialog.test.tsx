// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Dialog } from "@/components/ui/dialog";

function ExampleDialog({ withContent = false }: { withContent?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open AI actions
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="AI actions">
        {withContent ? (
          <>
            <button type="button">First action</button>
            <button type="button">Last action</button>
          </>
        ) : (
          <p>Dialog contents</p>
        )}
      </Dialog>
    </>
  );
}

afterEach(cleanup);

describe("Dialog", () => {
  it("focuses the accessible dialog and closes it on Escape", () => {
    render(<ExampleDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Open AI actions" }));
    const dialog = screen.getByRole("dialog", { name: "AI actions" });

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the backdrop is pressed", () => {
    render(<ExampleDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Open AI actions" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog.parentElement!);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("traps Tab focus within the dialog", () => {
    render(<ExampleDialog withContent />);

    fireEvent.click(screen.getByRole("button", { name: "Open AI actions" }));
    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    const firstAction = screen.getByRole("button", { name: "First action" });
    const lastAction = screen.getByRole("button", { name: "Last action" });

    // Tab from the last focusable element wraps to the first.
    lastAction.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    // Shift+Tab from the first focusable element wraps to the last.
    closeButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastAction);

    // Forward Tab from a middle element is left to the browser default.
    firstAction.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(firstAction);
  });

  it("pulls focus back into the dialog when it has escaped", () => {
    render(<ExampleDialog withContent />);

    fireEvent.click(screen.getByRole("button", { name: "Open AI actions" }));
    const trigger = screen.getByRole("button", { name: "Open AI actions" });
    const closeButton = screen.getByRole("button", { name: "Close dialog" });

    // Focus has somehow landed on a background control; Tab returns it.
    trigger.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
  });

  it("leaves non-Tab keys alone", () => {
    render(<ExampleDialog withContent />);

    fireEvent.click(screen.getByRole("button", { name: "Open AI actions" }));
    const firstAction = screen.getByRole("button", { name: "First action" });

    firstAction.focus();
    fireEvent.keyDown(document, { key: "a" });
    expect(document.activeElement).toBe(firstAction);
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });
});
