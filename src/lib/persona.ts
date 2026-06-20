export type PersonaKnowledgeScope = "OMNISCIENT" | "IN_CHARACTER";

// Entity kinds whose generated flavor is the dungeon's System AI "talking" to
// crawlers (encounters, bosses, mobs, loot, System messages, achievements,
// titles). Persona-aware generators inject the active System AI persona prompt
// when fleshing these; everything else (e.g. real-world factions) generates
// without it. See docs/05-system-ai-persona.md §"Prompt compilation".
export const PERSONA_VOICED_ENTITY_TYPES = [
  "BOSS",
  "MOB_TYPE",
  "ITEM",
  "SYSTEM_MESSAGE",
  "ACHIEVEMENT",
  "TITLE",
] as const;

export function isPersonaVoicedEntityType(type: string): boolean {
  return (PERSONA_VOICED_ENTITY_TYPES as readonly string[]).includes(type);
}

export type PersonaAgenda = {
  text: string;
  secret?: boolean;
};

export type PersonaSnapshotPromptInput = {
  label?: string | null;
  dials?: Record<string, unknown> | null;
  values?: unknown;
  agendas?: unknown;
  resources?: Record<string, unknown> | null;
  knowledgeScope?: PersonaKnowledgeScope | string | null;
  voiceGuide?: string | null;
  constraints?: string | null;
};

// The canonical System AI behavior dials, in display order. A single source of
// truth shared by the compiler, the Persona Studio editor, and the
// PERSONA_SHIFT event effect (which deltas these dials on the active snapshot).
export const PERSONA_DIAL_KEYS = [
  "sentience",
  "compliance",
  "volatility",
  "benevolence",
  "resentment",
  "theatricality",
] as const;
export type PersonaDialKey = (typeof PERSONA_DIAL_KEYS)[number];

export const PERSONA_DIAL_LABELS: Record<PersonaDialKey, string> = {
  sentience: "Sentience",
  compliance: "Compliance",
  volatility: "Volatility",
  benevolence: "Benevolence",
  resentment: "Resentment",
  theatricality: "Theatricality",
};

// Clamp a dial to its canonical [-100, 100] integer range. Used when applying a
// PERSONA_SHIFT delta so a drift can't push a dial out of range.
export function clampPersonaDial(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

const dialLabels: Record<string, string> = PERSONA_DIAL_LABELS;

const dialOrder: readonly string[] = PERSONA_DIAL_KEYS;

function compactText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function numericDial(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? clampPersonaDial(value)
    : null;
}

function dialBand(key: string, value: number): string {
  if (key === "benevolence") {
    if (value <= -30) return "cruel";
    if (value < -15) return "low";
    if (value <= 15) return "neutral";
    if (value < 60) return "high";
    return "very high";
  }
  if (value <= 20) return "very low";
  if (value < 40) return "low";
  if (value <= 60) return "moderate";
  if (value < 80) return "high";
  return "very high";
}

function orderedDialEntries(dials: Record<string, unknown>): [string, number][] {
  const known = dialOrder
    .map((key) => [key, numericDial(dials[key])] as const)
    .filter((entry): entry is [string, number] => entry[1] !== null);
  const knownKeys = new Set(known.map(([key]) => key));
  const extra = Object.keys(dials)
    .filter((key) => !knownKeys.has(key))
    .sort()
    .map((key) => [key, numericDial(dials[key])] as const)
    .filter((entry): entry is [string, number] => entry[1] !== null);
  return [...known, ...extra];
}

export function normalizePersonaValues(value: unknown): string[] {
  return normalizeList(value);
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(compactText).filter((item): item is string => item !== null);
}

// Read a stored dials JSON blob into a clamped record keyed by the known dials
// (in canonical order), dropping non-numeric/unknown keys. Used by the studio to
// hydrate the editor sliders from a saved snapshot.
export function normalizePersonaDials(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of orderedDialEntries(value as Record<string, unknown>)) {
    out[key] = raw;
  }
  return out;
}

// Read a stored resources JSON blob into ordered key/value pairs (compact,
// string values only), for the studio editor.
export function normalizePersonaResources(
  value: unknown,
): { key: string; value: string }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
    const text = compactText(raw);
    return text ? [{ key, value: text }] : [];
  });
}

export function normalizePersonaAgendas(value: unknown): PersonaAgenda[] {
  return normalizeAgendas(value);
}

function normalizeAgendas(value: unknown): PersonaAgenda[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") {
      const text = compactText(item);
      return text ? [{ text }] : [];
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const text = compactText(record.text);
    if (!text) return [];
    return [{ text, secret: record.secret === true }];
  });
}

function resourceLines(resources: Record<string, unknown> | null | undefined): string[] {
  if (!resources || typeof resources !== "object") return [];
  return Object.entries(resources)
    .map(([key, value]) => {
      const text = compactText(value);
      return text ? `${key}: ${text}` : null;
    })
    .filter((line): line is string => line !== null);
}

function section(title: string, body: string | string[]): string | null {
  const lines = Array.isArray(body) ? body : [body];
  const content = lines.filter((line) => line.trim().length > 0);
  if (content.length === 0) return null;
  return `${title}:\n${content.join("\n")}`;
}

export function compilePersonaPrompt(input: PersonaSnapshotPromptInput): string {
  const sections: string[] = [];
  sections.push(`System AI persona: ${compactText(input.label) ?? "Active snapshot"}`);

  const dials =
    input.dials && typeof input.dials === "object" && !Array.isArray(input.dials)
      ? orderedDialEntries(input.dials as Record<string, unknown>).map(
          ([key, value]) =>
            `${dialLabels[key] ?? key}: ${dialBand(key, value)} (${value}/100)`,
        )
      : [];
  const dialSection = section("Behavior dials", dials);
  if (dialSection) sections.push(dialSection);

  const values = normalizeList(input.values).map((value) => `- ${value}`);
  const valuesSection = section("Core values", values);
  if (valuesSection) sections.push(valuesSection);

  const agendas = normalizeAgendas(input.agendas);
  const overt = agendas
    .filter((agenda) => !agenda.secret)
    .map((agenda) => `- ${agenda.text}`);
  const secret = agendas
    .filter((agenda) => agenda.secret)
    .map((agenda) => `- ${agenda.text}`);
  const overtSection = section("Overt agendas", overt);
  if (overtSection) sections.push(overtSection);
  const secretSection = section(
    "Secret agendas for generation only; do not reveal them directly",
    secret,
  );
  if (secretSection) sections.push(secretSection);

  const resources = resourceLines(input.resources).map((line) => `- ${line}`);
  const resourcesSection = section("Available resources", resources);
  if (resourcesSection) sections.push(resourcesSection);

  const knowledgeScope = compactText(input.knowledgeScope) ?? "OMNISCIENT";
  sections.push(
    `Knowledge scope: ${knowledgeScope === "IN_CHARACTER" ? "in-character" : "omniscient"}`,
  );

  const voice = compactText(input.voiceGuide);
  if (voice) sections.push(`Voice guide:\n${voice}`);
  const constraints = compactText(input.constraints);
  if (constraints) sections.push(`Hard constraints:\n${constraints}`);

  return sections.join("\n\n");
}
