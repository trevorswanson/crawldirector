// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Dialog } from "@/components/ui/dialog";

function ExampleDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open AI actions
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="AI actions">
        <p>Dialog contents</p>
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
});
