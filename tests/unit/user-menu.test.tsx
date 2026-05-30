// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { UserMenu } from "@/components/console/user-menu";

vi.mock("@/app/(dm)/actions", () => ({
  signOutAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("UserMenu", () => {
  const defaultUser = {
    name: "Demo DM",
    email: "dm@example.com",
  };

  it("renders initials button and toggles the menu open/closed on click", () => {
    render(<UserMenu user={defaultUser} initials="DD" fxEnabled={true} />);

    // Initials button should be visible
    const button = screen.getByRole("button", { name: "User menu" });
    expect(button).toBeDefined();
    expect(button.textContent).toBe("DD");

    // Menu should be closed by default (no user info visible)
    expect(screen.queryByText("Demo DM")).toBeNull();

    // Click initials button to open
    fireEvent.click(button);
    expect(screen.getByText("Demo DM")).toBeDefined();
    expect(screen.getByText("dm@example.com")).toBeDefined();

    // Click initials button again to close
    fireEvent.click(button);
    expect(screen.queryByText("Demo DM")).toBeNull();
  });

  it("shows planned Account Settings as disabled", () => {
    render(<UserMenu user={defaultUser} initials="DD" fxEnabled={true} />);

    // Open menu
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    const accountSettings = screen.getByTitle(/Account Settings/);
    expect(accountSettings).toBeDefined();
    expect(accountSettings.getAttribute("aria-disabled")).toBe("true");
    expect(accountSettings.textContent).toContain("Planned");
  });

  it("contains the Sign Out action form button", () => {
    render(<UserMenu user={defaultUser} initials="DD" fxEnabled={true} />);

    // Open menu
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    const signOutButton = screen.getByRole("button", { name: "Sign Out" });
    expect(signOutButton).toBeDefined();
  });

  it("toggles the FX class on document element when enabling/disabling UI effects", () => {
    const toggleSpy = vi.spyOn(document.documentElement.classList, "toggle");

    render(<UserMenu user={defaultUser} initials="DD" fxEnabled={true} />);

    // Open menu
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    const toggleButton = screen.getByRole("button", { name: /Enable UI Effects/ });
    expect(toggleButton).toBeDefined();

    // Click to toggle off (since default was true)
    fireEvent.click(toggleButton);
    expect(toggleSpy).toHaveBeenCalledWith("fx", false);

    // Click to toggle back on
    fireEvent.click(toggleButton);
    expect(toggleSpy).toHaveBeenCalledWith("fx", true);

    toggleSpy.mockRestore();
  });

  it("does not close the menu when clicking on the FX toggle button", () => {
    render(<UserMenu user={defaultUser} initials="DD" fxEnabled={true} />);

    // Open menu
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByText("Demo DM")).toBeDefined();

    // Click toggle effects button
    const toggleButton = screen.getByRole("button", { name: /Enable UI Effects/ });
    fireEvent.click(toggleButton);

    // Menu should still be open
    expect(screen.getByText("Demo DM")).toBeDefined();
  });

  it("closes the menu when clicking outside of the component", () => {
    render(
      <div>
        <div data-testid="outside">Outside Area</div>
        <UserMenu user={defaultUser} initials="DD" fxEnabled={true} />
      </div>,
    );

    // Open menu
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByText("Demo DM")).toBeDefined();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId("outside"));

    // Menu should close
    expect(screen.queryByText("Demo DM")).toBeNull();
  });

  it("closes the menu when focus leaves the component via blur", () => {
    render(
      <div>
        <button type="button" data-testid="outside-focus">Focus Target</button>
        <UserMenu user={defaultUser} initials="DD" fxEnabled={true} />
      </div>,
    );

    // Open menu
    const initialsButton = screen.getByRole("button", { name: "User menu" });
    fireEvent.click(initialsButton);
    expect(screen.getByText("Demo DM")).toBeDefined();

    // Blur from menu container to outside focus target
    const menuContainer = initialsButton.parentElement!;
    fireEvent.blur(menuContainer, {
      relatedTarget: screen.getByTestId("outside-focus"),
    });

    // Menu should close
    expect(screen.queryByText("Demo DM")).toBeNull();
  });

  it("displays 'Dungeon Master' fallback when user.name is null", () => {
    render(<UserMenu user={{ name: null, email: "dm@example.com" }} initials="DD" fxEnabled={true} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByText("Dungeon Master")).toBeDefined();
  });

  it("handles localStorage write failures gracefully", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    render(<UserMenu user={defaultUser} initials="DD" fxEnabled={true} />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));
    const toggleButton = screen.getByRole("button", { name: /Enable UI Effects/ });
    expect(() => fireEvent.click(toggleButton)).not.toThrow();
    setItemSpy.mockRestore();
  });

  it("closes the menu on blur when relatedTarget is null", () => {
    render(<UserMenu user={defaultUser} initials="DD" fxEnabled={true} />);
    const initialsButton = screen.getByRole("button", { name: "User menu" });
    fireEvent.click(initialsButton);
    expect(screen.getByText("Demo DM")).toBeDefined();

    // Blur with null relatedTarget (e.g. blurring to document body or out of window)
    fireEvent.blur(initialsButton.parentElement!, {
      relatedTarget: null,
    });
    expect(screen.queryByText("Demo DM")).toBeNull();
  });

  it("does not close the menu when clicking inside the menu container", () => {
    render(<UserMenu user={defaultUser} initials="DD" fxEnabled={true} />);
    const initialsButton = screen.getByRole("button", { name: "User menu" });
    fireEvent.click(initialsButton);
    expect(screen.getByText("Demo DM")).toBeDefined();

    // Click inside the menu (e.g. clicking the user name text)
    fireEvent.mouseDown(screen.getByText("Demo DM"));
    
    // Blur container while mouse is down - it should not close
    fireEvent.blur(initialsButton.parentElement!);
    expect(screen.getByText("Demo DM")).toBeDefined();

    // Release mouse button globally
    fireEvent.mouseUp(window);
  });
});
