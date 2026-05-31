// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { Markdown } from "@/components/ui/markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders headings at every depth with size classes", () => {
    const { container } = render(
      <Markdown content={"# H1\n\n## H2\n\n### H3\n\n#### H4"} />,
    );
    expect(container.querySelector("h1")?.className).toContain("text-2xl");
    expect(container.querySelector("h2")?.className).toContain("text-xl");
    expect(container.querySelector("h3")?.className).toContain("text-lg");
    expect(container.querySelector("h4")?.className).toContain("text-base");
  });

  it("renders inline emphasis, strong, code, and links with/without titles", () => {
    const { container } = render(
      <Markdown
        content={
          'Some *emphasis*, **bold**, `code`, ' +
          '[titled](https://a.test "Tip") and [bare](https://b.test).'
        }
      />,
    );
    expect(container.querySelector("em")?.textContent).toBe("emphasis");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("code")?.textContent).toBe("code");
    const links = container.querySelectorAll("a");
    expect(links[0].getAttribute("title")).toBe("Tip");
    expect(links[1].getAttribute("title")).toBe("");
  });

  it("renders ordered and unordered lists, blockquotes, code blocks, and rules", () => {
    const { container } = render(
      <Markdown
        content={
          "- one\n- two\n\n1. first\n2. second\n\n> a quote\n\n```\ncode block\n```\n\n---"
        }
      />,
    );
    expect(container.querySelector("ul.list-disc")).not.toBeNull();
    expect(container.querySelector("ol.list-decimal")).not.toBeNull();
    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelector("pre code")?.textContent).toContain("code block");
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("renders tables", () => {
    const { container } = render(
      <Markdown content={"| A | B |\n| - | - |\n| 1 | 2 |"} />,
    );
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });

  it("appends a caller-supplied class onto the markdown wrapper", () => {
    const { container } = render(<Markdown content={"hi"} className="prose" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toBe("prose markdown-content");
  });

  it("falls back to the bare wrapper class with no content", () => {
    const { container } = render(<Markdown content={""} />);
    expect(container.firstElementChild?.className).toBe("markdown-content");
  });
});
