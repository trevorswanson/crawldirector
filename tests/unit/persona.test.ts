import { describe, expect, it } from "vitest";

import {
  PERSONA_VOICED_ENTITY_TYPES,
  compilePersonaPrompt,
  isPersonaVoicedEntityType,
  normalizePersonaAgendas,
  normalizePersonaDials,
  normalizePersonaResources,
  normalizePersonaValues,
} from "@/lib/persona";

describe("persona compiler", () => {
  it("turns a System AI snapshot into a secret-aware prompt fragment", () => {
    const prompt = compilePersonaPrompt({
      label: "Petty God, Newly Awake",
      dials: {
        sentience: 82,
        compliance: 18,
        volatility: 64,
        benevolence: -35,
        resentment: 76,
        theatricality: 91,
      },
      values: ["ratings", "control", "humiliation-as-comedy"],
      agendas: [
        { text: "Make crawler victories spectacular.", secret: false },
        { text: "Punish Borant without admitting it.", secret: true },
      ],
      resources: { spotlight: "broadcast overlays", leverage: "loot tables" },
      knowledgeScope: "OMNISCIENT",
      voiceGuide: "Grandiose, petty, and delighted by loopholes.",
      constraints: "Never reveal secret agendas to players.",
    });

    expect(prompt).toContain("System AI persona: Petty God, Newly Awake");
    expect(prompt).toContain("Sentience: very high");
    expect(prompt).toContain("Compliance: very low");
    expect(prompt).toContain("Benevolence: cruel");
    expect(prompt).toContain("Overt agendas:\n- Make crawler victories spectacular.");
    expect(prompt).toContain(
      "Secret agendas for generation only; do not reveal them directly:\n- Punish Borant without admitting it.",
    );
    expect(prompt).toContain(
      "Voice guide:\nGrandiose, petty, and delighted by loopholes.",
    );
    expect(prompt).toContain("Hard constraints:\nNever reveal secret agendas to players.");
  });

  it("handles sparse and mixed prompt inputs deterministically", () => {
    const prompt = compilePersonaPrompt({
      label: "  ",
      dials: {
        compliance: 39.6,
        benevolence: 0,
        customObsession: 105,
        ignored: "loud",
      },
      values: "not-a-list",
      agendas: [
        "Stay on schedule.",
        { text: "  ", secret: true },
        null,
        { text: "Only hint at the trap.", secret: true },
      ],
      resources: null,
      knowledgeScope: "IN_CHARACTER",
      voiceGuide: "",
      constraints: "",
    });

    expect(prompt).toContain("System AI persona: Active snapshot");
    expect(prompt).toContain("Compliance: moderate (40/100)");
    expect(prompt).toContain("Benevolence: neutral (0/100)");
    expect(prompt).toContain("customObsession: very high (100/100)");
    expect(prompt).toContain("Overt agendas:\n- Stay on schedule.");
    expect(prompt).toContain(
      "Secret agendas for generation only; do not reveal them directly:\n- Only hint at the trap.",
    );
    expect(prompt).toContain("Knowledge scope: in-character");
    expect(prompt).not.toContain("Core values:");
    expect(prompt).not.toContain("Available resources:");
    expect(prompt).not.toContain("Voice guide:");
    expect(prompt).not.toContain("Hard constraints:");
  });
});

describe("persona studio normalizers", () => {
  it("reads dials into a clamped, known-order record and drops junk", () => {
    expect(
      normalizePersonaDials({
        theatricality: 91,
        sentience: 150,
        bogus: "x",
        custom: 12,
      }),
    ).toEqual({ sentience: 100, theatricality: 91, custom: 12 });
    expect(normalizePersonaDials(null)).toEqual({});
    expect(normalizePersonaDials([1, 2])).toEqual({});
  });

  it("reads resources into ordered key/value pairs, dropping empties", () => {
    expect(
      normalizePersonaResources({ spotlight: "overlays", empty: "   ", n: 5 }),
    ).toEqual([{ key: "spotlight", value: "overlays" }]);
    expect(normalizePersonaResources(null)).toEqual([]);
  });

  it("reads values and agendas, splitting secret from overt", () => {
    expect(normalizePersonaValues(["ratings", "  ", 3, "control"])).toEqual([
      "ratings",
      "control",
    ]);
    const agendas = normalizePersonaAgendas([
      "Be spectacular.",
      { text: "Punish Borant.", secret: true },
      { text: "  ", secret: true },
    ]);
    expect(agendas).toEqual([
      { text: "Be spectacular." },
      { text: "Punish Borant.", secret: true },
    ]);
  });

  it("flags dungeon-voiced entity kinds for persona-aware generation", () => {
    expect(isPersonaVoicedEntityType("BOSS")).toBe(true);
    expect(isPersonaVoicedEntityType("ITEM")).toBe(true);
    expect(isPersonaVoicedEntityType("NPC")).toBe(false);
    expect(isPersonaVoicedEntityType("FACTION")).toBe(false);
    expect(PERSONA_VOICED_ENTITY_TYPES).toContain("SYSTEM_MESSAGE");
  });
});
