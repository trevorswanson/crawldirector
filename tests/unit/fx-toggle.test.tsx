// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FxToggle } from "@/components/ui/fx-toggle";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.classList.remove("fx");
  document.cookie = "cd-fx=; path=/; max-age=0";
});

describe("FxToggle", () => {
  it("defaults to on and reflects the pressed state and tooltip", () => {
    render(<FxToggle />);

    const button = screen.getByRole("button", { name: /FX/ });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("title")).toMatch(/on — click to disable/);
  });

  it("renders the off state when defaultOn is false", () => {
    render(<FxToggle defaultOn={false} />);

    const button = screen.getByRole("button", { name: /FX/ });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("title")).toMatch(/off — click to enable/);
  });

  it("toggles the fx class and cookie when clicked", () => {
    const toggleSpy = vi.spyOn(document.documentElement.classList, "toggle");
    render(<FxToggle defaultOn={true} />);

    const button = screen.getByRole("button", { name: /FX/ });

    // First click disables.
    fireEvent.click(button);
    expect(toggleSpy).toHaveBeenCalledWith("fx", false);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(document.cookie).toContain("cd-fx=off");

    // Second click re-enables.
    fireEvent.click(button);
    expect(toggleSpy).toHaveBeenCalledWith("fx", true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.cookie).toContain("cd-fx=on");
  });

  it("survives a localStorage write failure", () => {
    // jsdom's localStorage may use getters or be non-configurable on the
    // instance, so we override the whole property on `window` with a trap
    // that always throws for `setItem`.
    const real = window.localStorage;
    let setItemCalled = false;
    const trap = {
      ...real,
      setItem() {
        setItemCalled = true;
        throw new Error("quota exceeded");
      },
    };
    Object.defineProperty(window, "localStorage", {
      value: trap,
      writable: true,
      configurable: true,
    });

    render(<FxToggle />);

    const button = screen.getByRole("button", { name: /FX/ });
    expect(() => fireEvent.click(button)).not.toThrow();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(setItemCalled).toBe(true);

    // Restore the real localStorage.
    Object.defineProperty(window, "localStorage", {
      value: real,
      writable: true,
      configurable: true,
    });
  });
});
