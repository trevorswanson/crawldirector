// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { FxToggle } from "@/components/ui/fx-toggle";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

afterEach(cleanup);

describe("Button", () => {
  it("renders children and forwards props/className", () => {
    render(
      <Button className="extra" disabled>
        Click
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Click" });
    expect(btn).toBeDefined();
    expect(btn.className).toContain("extra");
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("applies variant and size classes", () => {
    render(
      <Button variant="outline" size="lg">
        Outline
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Outline" });
    expect(btn.className).toContain("border");
    expect(btn.className).toContain("h-11");
  });

  it("exposes a buttonVariants helper", () => {
    expect(typeof buttonVariants()).toBe("string");
    expect(buttonVariants({ variant: "destructive" })).toContain("var(--no)");
    expect(buttonVariants({ variant: "ghost", size: "sm" })).toContain("h-8");
  });
});

describe("Card family", () => {
  it("renders the full composition with merged classes", () => {
    render(
      <Card className="card-x">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Desc</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Foot</CardFooter>
      </Card>,
    );
    expect(screen.getByText("Title")).toBeDefined();
    expect(screen.getByText("Desc")).toBeDefined();
    expect(screen.getByText("Body")).toBeDefined();
    expect(screen.getByText("Foot")).toBeDefined();
    expect(screen.getByText("Title").tagName).toBe("H3");
  });
});

describe("Input", () => {
  it("renders with the given type and props", () => {
    render(<Input type="email" placeholder="you@example.com" />);
    const input = screen.getByPlaceholderText("you@example.com");
    expect(input.getAttribute("type")).toBe("email");
  });
});

describe("Label", () => {
  it("associates with a control via htmlFor", () => {
    render(<Label htmlFor="email">Email</Label>);
    const label = screen.getByText("Email");
    expect(label.tagName).toBe("LABEL");
    expect(label.getAttribute("for")).toBe("email");
  });
});

describe("FxToggle", () => {
  it("toggles the FX class and cookies on click", () => {
    const toggleSpy = vi.spyOn(document.documentElement.classList, "toggle");

    render(<FxToggle defaultOn={true} />);
    const button = screen.getByRole("button", { name: /FX/ });
    expect(button.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(toggleSpy).toHaveBeenCalledWith("fx", false);

    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(toggleSpy).toHaveBeenCalledWith("fx", true);

    toggleSpy.mockRestore();
  });
});
