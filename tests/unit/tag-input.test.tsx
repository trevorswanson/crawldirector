// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TagInput } from "@/components/entities/tag-input";

afterEach(cleanup);

function hiddenValue(): string {
  const input = document.querySelector(
    'input[type="hidden"][name="tags"]',
  ) as HTMLInputElement | null;
  return input?.value ?? "";
}

describe("TagInput", () => {
  it("renders existing tags as chips and seeds the hidden field", () => {
    render(<TagInput defaultTags={["floor 1", "sponsor"]} />);

    expect(screen.getByText("floor 1")).toBeDefined();
    expect(screen.getByText("sponsor")).toBeDefined();
    expect(hiddenValue()).toBe("floor 1,sponsor");
  });

  it("dedupes case-insensitively from the default list", () => {
    render(<TagInput defaultTags={["Rumor", "rumor", "  ", "Boss"]} />);

    expect(hiddenValue()).toBe("Rumor,Boss");
  });

  it("adds a typed tag on Enter and updates the hidden field", () => {
    render(<TagInput />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.change(input, { target: { value: "viral clip" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("viral clip")).toBeDefined();
    expect(hiddenValue()).toBe("viral clip");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("adds a tag on comma and ignores case-insensitive duplicates", () => {
    render(<TagInput defaultTags={["floor 1"]} />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.change(input, { target: { value: "FLOOR 1" } });
    fireEvent.keyDown(input, { key: "," });

    // Duplicate ignored; input cleared.
    expect(hiddenValue()).toBe("floor 1");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("splits a pasted comma list into distinct chips on commit", () => {
    render(<TagInput defaultTags={["floor 1"]} />);
    const input = screen.getByLabelText("Add tag");

    // Paste-like value containing commas, committed with Enter.
    fireEvent.change(input, { target: { value: "a, b, FLOOR 1, c" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Three new chips added; the case-insensitive duplicate "FLOOR 1" is dropped.
    expect(screen.getByText("a")).toBeDefined();
    expect(screen.getByText("b")).toBeDefined();
    expect(screen.getByText("c")).toBeDefined();
    expect(hiddenValue()).toBe("floor 1,a,b,c");
  });

  it("removes the last tag on Backspace when the input is empty", () => {
    render(<TagInput defaultTags={["a", "b"]} />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.keyDown(input, { key: "Backspace" });

    expect(hiddenValue()).toBe("a");
    expect(screen.queryByText("b")).toBeNull();
  });

  it("removes a tag via its remove button", () => {
    render(<TagInput defaultTags={["keep", "drop"]} />);

    fireEvent.click(screen.getByLabelText("Remove tag drop"));

    expect(hiddenValue()).toBe("keep");
    expect(screen.queryByText("drop")).toBeNull();
  });

  it("suggests matching campaign tags and adds the chosen one", () => {
    render(<TagInput suggestions={["floor 1", "floor 2", "sponsor"]} />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "floor" } });

    const option = screen.getByRole("option", { name: "floor 2" });
    fireEvent.mouseDown(option);

    expect(hiddenValue()).toBe("floor 2");
    // Already-selected tags drop out of the suggestion list.
    expect(screen.queryByRole("option", { name: "floor 2" })).toBeNull();
  });

  it("offers a 'New' option for an unmatched typed tag", () => {
    render(<TagInput suggestions={["sponsor"]} />);
    const input = screen.getByLabelText("Add tag");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "rumor" } });

    const newOption = screen.getByText("New").closest("button");
    expect(newOption).not.toBeNull();
    fireEvent.mouseDown(newOption!);

    expect(hiddenValue()).toBe("rumor");
  });

  it("renders read-only chips without an input", () => {
    render(<TagInput defaultTags={["locked"]} readOnly />);

    expect(screen.getByText("locked")).toBeDefined();
    expect(screen.queryByLabelText("Add tag")).toBeNull();
    expect(hiddenValue()).toBe("locked");
  });

  it("shows a 'No tags' placeholder in read-only mode when empty", () => {
    render(<TagInput defaultTags={[]} readOnly />);

    expect(screen.getByText("No tags")).toBeDefined();
    expect(hiddenValue()).toBe("");
  });

  it("stops adding tags once the 20-tag cap is reached", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `t${i}`);
    render(<TagInput defaultTags={twenty} />);
    const input = screen.getByLabelText("Add tag") as HTMLInputElement;

    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe("Tag limit reached");
    expect(hiddenValue().split(",")).toHaveLength(20);
  });
});
