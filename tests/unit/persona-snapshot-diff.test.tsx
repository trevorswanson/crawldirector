// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PersonaSnapshotDiffPanel } from "@/components/persona/persona-snapshot-diff";
import type { PersonaSnapshotDiff } from "@/lib/persona-diff";

const changed: PersonaSnapshotDiff = {
  dials: [{ key: "compliance", label: "Compliance", before: 57, after: 42 }],
  agendas: {
    added: [{ text: "Rule-bending spectacle", secret: false }],
    removed: [{ text: "Court appeasement", secret: false }],
  },
  values: { added: ["Escalate the show"], removed: ["Follow the rules"] },
  resources: [{ key: "cameras", before: "standard feed", after: "premium feed" }],
  fields: [{ label: "Voice guide", before: "Measured.", after: "Grandiose." }],
  compiledPromptChanged: true,
  hasChanges: true,
};

afterEach(() => cleanup());

describe("PersonaSnapshotDiffPanel", () => {
  it("renders changed dials as before and after values with agenda context", () => {
    render(<PersonaSnapshotDiffPanel previousLabel="Court ruling" diff={changed} />);

    expect(screen.getByText(/Changed since Court ruling/i)).toBeDefined();
    expect(screen.getByText("Compliance")).toBeDefined();
    expect(screen.getByText("57 → 42")).toBeDefined();
    expect(screen.getByText("Agendas")).toBeDefined();
    expect(screen.getByText("+ Rule-bending spectacle").className).toContain("text-[var(--add)]");
    expect(screen.getByText("- Court appeasement").className).toContain("text-[var(--del)]");
  });

  it("renders changed collections and concise prompt status", () => {
    render(<PersonaSnapshotDiffPanel previousLabel="Court ruling" diff={changed} />);

    expect(screen.getByText("Values")).toBeDefined();
    expect(screen.getByText("Resources")).toBeDefined();
    expect(screen.getByText("Voice guide")).toBeDefined();
    expect(screen.getByText("Compiled prompt")).toBeDefined();
    expect(screen.getByText("Updated")).toBeDefined();
  });

  it("renders a first-snapshot message without empty sections", () => {
    render(<PersonaSnapshotDiffPanel previousLabel={null} diff={null} />);

    expect(screen.getByText(/first recorded snapshot/i)).toBeDefined();
    expect(screen.queryByText("Agendas")).toBeNull();
  });

  it("does not render a panel when the adjacent snapshots are equivalent", () => {
    render(
      <PersonaSnapshotDiffPanel
        previousLabel="Court ruling"
        diff={{ ...changed, dials: [], agendas: { added: [], removed: [] }, values: { added: [], removed: [] }, resources: [], fields: [], compiledPromptChanged: false, hasChanges: false }}
      />,
    );

    expect(screen.queryByText(/Changed since/i)).toBeNull();
  });
});
