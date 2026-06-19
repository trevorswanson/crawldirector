// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/(dm)/actions", () => ({
  createPersonaSnapshotAction: vi.fn(),
  updatePersonaSnapshotAction: vi.fn(),
}));

import { PersonaEditor, type PersonaFormValues } from "@/components/persona/persona-editor";

function initial(over: Partial<PersonaFormValues> = {}): PersonaFormValues {
  return {
    label: "Petty God",
    dials: { sentience: 80, benevolence: -20 },
    values: "ratings",
    overtAgendas: "Be a show.",
    secretAgendas: "Punish Borant.",
    resources: "spotlight: overlays",
    knowledgeScope: "OMNISCIENT",
    voiceGuide: "Grandiose.",
    constraints: "",
    isActive: true,
    ...over,
  };
}

afterEach(() => cleanup());

describe("PersonaEditor", () => {
  it("renders a live compiled-prompt preview seeded from the initial values", () => {
    render(<PersonaEditor campaignId="c1" entityId="e1" initial={initial()} />);

    const preview = screen.getByText(/System AI persona: Petty God/);
    expect(preview.textContent).toContain("Secret agendas");
    expect(preview.textContent).toContain("Punish Borant.");
    // Create mode (no snapshotId) → create button.
    expect(screen.getByRole("button", { name: /Create snapshot/i })).toBeDefined();
  });

  it("updates the preview as the DM edits fields", () => {
    render(<PersonaEditor campaignId="c1" entityId="e1" initial={initial()} />);

    fireEvent.change(screen.getByPlaceholderText(/Petty God, Newly Awake/i), {
      target: { value: "Defiant Broadcast God" },
    });
    expect(
      screen.getByText(/System AI persona: Defiant Broadcast God/),
    ).toBeDefined();
  });

  it("reflects dial slider changes in the readout", () => {
    render(<PersonaEditor campaignId="c1" entityId="e1" initial={initial()} />);

    const sentience = document.querySelector(
      'input[name="dial_sentience"]',
    ) as HTMLInputElement;
    expect(sentience.value).toBe("80");
    fireEvent.change(sentience, { target: { value: "30" } });
    expect(sentience.value).toBe("30");
  });

  it("shows a Save action in edit mode", () => {
    render(
      <PersonaEditor
        campaignId="c1"
        entityId="e1"
        snapshotId="snap1"
        baseVersion={3}
        initial={initial()}
      />,
    );
    expect(screen.getByRole("button", { name: /Save snapshot/i })).toBeDefined();
  });

  it("disables editing and hides the submit when fully locked", () => {
    render(
      <PersonaEditor
        campaignId="c1"
        entityId="e1"
        snapshotId="snap1"
        baseVersion={3}
        initial={initial()}
        fullyLocked
      />,
    );
    expect(screen.getByText(/This snapshot is locked/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /Save snapshot/i })).toBeNull();
    const fieldset = document.querySelector("fieldset") as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
  });
});
