import { describe, expect, it } from "vitest";

import { diffPersonaSnapshots } from "@/lib/persona-diff";

const courtRuling = {
  id: "court",
  label: "Court ruling",
  dials: { compliance: 57, resentment: 43, sentience: 20 },
  values: ["Follow the rules", "Protect ratings"],
  overtAgendas: ["Court appeasement"],
  secretAgendas: ["Hide the loophole"],
  resources: [
    { key: "cameras", value: "standard feed" },
    { key: "lights", value: "one" },
  ],
  knowledgeScope: "OMNISCIENT" as const,
  voiceGuide: "Measured.",
  constraints: "Do not harm sponsors.",
  compiledPrompt: "court prompt",
  locked: false,
  promptLocked: false,
};

describe("diffPersonaSnapshots", () => {
  it("orders changed dials canonically and retains before and after values", () => {
    const diff = diffPersonaSnapshots(courtRuling, {
      ...courtRuling,
      dials: {
        theatricality: 90,
        resentment: 63,
        compliance: 42,
        sentience: 20,
      },
    });

    expect(diff.dials).toEqual([
      { key: "compliance", label: "Compliance", before: 57, after: 42 },
      { key: "resentment", label: "Resentment", before: 43, after: 63 },
      { key: "theatricality", label: "Theatricality", before: null, after: 90 },
    ]);
  });

  it("treats agenda visibility changes as a removal and addition", () => {
    const diff = diffPersonaSnapshots(courtRuling, {
      ...courtRuling,
      overtAgendas: ["Court appeasement", "Rule-bending spectacle"],
      secretAgendas: ["Court appeasement"],
    });

    expect(diff.agendas).toEqual({
      added: [
        { text: "Rule-bending spectacle", secret: false },
        { text: "Court appeasement", secret: true },
      ],
      removed: [{ text: "Hide the loophole", secret: true }],
    });
  });

  it("compares collection, resource, and scalar changes without unchanged rows", () => {
    const diff = diffPersonaSnapshots(courtRuling, {
      ...courtRuling,
      label: "Defiant broadcast",
      values: ["Protect ratings", "Escalate the show", "  "],
      resources: [
        { key: "cameras", value: "premium feed" },
        { key: "drones", value: "two" },
        { key: "", value: "ignored" },
      ],
      knowledgeScope: "IN_CHARACTER",
      voiceGuide: "Grandiose.",
      constraints: null,
      compiledPrompt: "defiant prompt",
      locked: true,
      promptLocked: true,
    });

    expect(diff.values).toEqual({
      added: ["Escalate the show"],
      removed: ["Follow the rules"],
    });
    expect(diff.resources).toEqual([
      { key: "cameras", before: "standard feed", after: "premium feed" },
      { key: "drones", before: null, after: "two" },
      { key: "lights", before: "one", after: null },
    ]);
    expect(diff.fields).toEqual([
      { label: "Label", before: "Court ruling", after: "Defiant broadcast" },
      { label: "Knowledge scope", before: "Omniscient", after: "In character" },
      { label: "Voice guide", before: "Measured.", after: "Grandiose." },
      { label: "Constraints", before: "Do not harm sponsors.", after: "—" },
      { label: "Locked", before: "No", after: "Yes" },
      { label: "Prompt locked", before: "No", after: "Yes" },
    ]);
    expect(diff.compiledPromptChanged).toBe(true);
  });

  it("sorts historic extension dials and normalizes empty text", () => {
    const diff = diffPersonaSnapshots(
      { ...courtRuling, dials: { zeta: 1, alpha: 2 }, values: ["  ", "same"] },
      { ...courtRuling, dials: { zeta: 3, alpha: 4 }, values: ["same", " "] },
    );

    expect(diff.dials.map((dial) => dial.key)).toEqual(["alpha", "zeta"]);
    expect(diff.values).toEqual({ added: [], removed: [] });
  });

  it("returns no displayable changes for equivalent normalized snapshots", () => {
    const diff = diffPersonaSnapshots(courtRuling, {
      ...courtRuling,
      dials: { ...courtRuling.dials },
      values: [...courtRuling.values],
      overtAgendas: [...courtRuling.overtAgendas],
      secretAgendas: [...courtRuling.secretAgendas],
      resources: courtRuling.resources.map((resource) => ({ ...resource })),
    });

    expect(diff).toEqual({
      dials: [],
      agendas: { added: [], removed: [] },
      values: { added: [], removed: [] },
      resources: [],
      fields: [],
      compiledPromptChanged: false,
      hasChanges: false,
    });
  });
});
