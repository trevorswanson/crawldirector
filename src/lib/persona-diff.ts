import {
  PERSONA_DIAL_KEYS,
  PERSONA_DIAL_LABELS,
  type PersonaDialKey,
  type PersonaKnowledgeScope,
} from "@/lib/persona";

export type PersonaDiffSnapshot = {
  id: string;
  label: string | null;
  dials: Record<string, number>;
  values: string[];
  overtAgendas: string[];
  secretAgendas: string[];
  resources: { key: string; value: string }[];
  knowledgeScope: PersonaKnowledgeScope;
  voiceGuide: string | null;
  constraints: string | null;
  compiledPrompt: string | null;
  locked: boolean;
  promptLocked: boolean;
};

export type PersonaDialDiff = {
  key: string;
  label: string;
  before: number | null;
  after: number | null;
};

export type PersonaAgendaDiff = {
  text: string;
  secret: boolean;
};

export type PersonaScalarDiff = {
  label: string;
  before: string;
  after: string;
};

export type PersonaSnapshotDiff = {
  dials: PersonaDialDiff[];
  agendas: { added: PersonaAgendaDiff[]; removed: PersonaAgendaDiff[] };
  values: { added: string[]; removed: string[] };
  resources: { key: string; before: string | null; after: string | null }[];
  fields: PersonaScalarDiff[];
  compiledPromptChanged: boolean;
  hasChanges: boolean;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function displayText(value: unknown): string {
  return text(value) ?? "—";
}

function sortedValues(values: readonly unknown[]): string[] {
  return [...new Set(values.flatMap((value) => (text(value) ? [text(value)!] : []))).values()].sort(
    (left, right) => left.localeCompare(right),
  );
}

function difference(before: readonly string[], after: readonly string[]) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((value) => !beforeSet.has(value)),
    removed: before.filter((value) => !afterSet.has(value)),
  };
}

function orderedDialKeys(before: Record<string, number>, after: Record<string, number>): string[] {
  const all = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [
    ...PERSONA_DIAL_KEYS.filter((key) => all.has(key)),
    ...[...all]
      .filter((key) => !PERSONA_DIAL_KEYS.includes(key as PersonaDialKey))
      .sort((left, right) => left.localeCompare(right)),
  ];
}

function dialValue(dials: Record<string, number>, key: string): number | null {
  const value = dials[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function agendaKey(agenda: PersonaAgendaDiff): string {
  return `${agenda.secret ? "secret" : "overt"}\u0000${agenda.text}`;
}

function sortedAgendas(values: readonly unknown[], secret: boolean): PersonaAgendaDiff[] {
  return sortedValues(values).map((value) => ({ text: value, secret }));
}

function compareAgendas(before: PersonaDiffSnapshot, after: PersonaDiffSnapshot) {
  const beforeEntries = [
    ...sortedAgendas(before.overtAgendas, false),
    ...sortedAgendas(before.secretAgendas, true),
  ];
  const afterEntries = [
    ...sortedAgendas(after.overtAgendas, false),
    ...sortedAgendas(after.secretAgendas, true),
  ];
  const beforeKeys = new Set(beforeEntries.map(agendaKey));
  const afterKeys = new Set(afterEntries.map(agendaKey));
  const byDisplayOrder = (left: PersonaAgendaDiff, right: PersonaAgendaDiff) =>
    Number(left.secret) - Number(right.secret) || left.text.localeCompare(right.text);

  return {
    added: afterEntries.filter((entry) => !beforeKeys.has(agendaKey(entry))).sort(byDisplayOrder),
    removed: beforeEntries
      .filter((entry) => !afterKeys.has(agendaKey(entry)))
      .sort(byDisplayOrder),
  };
}

function resourcesByKey(resources: readonly { key: string; value: string }[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const resource of resources) {
    const key = text(resource?.key);
    const value = text(resource?.value);
    if (key && value) result.set(key, value);
  }
  return result;
}

function knowledgeScopeLabel(scope: PersonaKnowledgeScope): string {
  return scope === "IN_CHARACTER" ? "In character" : "Omniscient";
}

function booleanLabel(value: boolean): string {
  return value ? "Yes" : "No";
}

export function diffPersonaSnapshots(
  before: PersonaDiffSnapshot,
  after: PersonaDiffSnapshot,
): PersonaSnapshotDiff {
  const dials = orderedDialKeys(before.dials, after.dials).flatMap((key) => {
    const beforeValue = dialValue(before.dials, key);
    const afterValue = dialValue(after.dials, key);
    if (beforeValue === afterValue) return [];
    return [{ key, label: PERSONA_DIAL_LABELS[key as PersonaDialKey] ?? key, before: beforeValue, after: afterValue }];
  });

  const agendas = compareAgendas(before, after);
  const values = difference(sortedValues(before.values), sortedValues(after.values));

  const beforeResources = resourcesByKey(before.resources);
  const afterResources = resourcesByKey(after.resources);
  const resources = [...new Set([...beforeResources.keys(), ...afterResources.keys()])]
    .toSorted((left, right) => left.localeCompare(right))
    .flatMap((key) => {
      const beforeValue = beforeResources.get(key) ?? null;
      const afterValue = afterResources.get(key) ?? null;
      return beforeValue === afterValue ? [] : [{ key, before: beforeValue, after: afterValue }];
    });

  const scalarFields: [string, string, string][] = [
    ["Label", displayText(before.label), displayText(after.label)],
    [
      "Knowledge scope",
      knowledgeScopeLabel(before.knowledgeScope),
      knowledgeScopeLabel(after.knowledgeScope),
    ],
    ["Voice guide", displayText(before.voiceGuide), displayText(after.voiceGuide)],
    ["Constraints", displayText(before.constraints), displayText(after.constraints)],
    ["Locked", booleanLabel(before.locked), booleanLabel(after.locked)],
    ["Prompt locked", booleanLabel(before.promptLocked), booleanLabel(after.promptLocked)],
  ];
  const fields = scalarFields.flatMap(([label, beforeValue, afterValue]) =>
    beforeValue === afterValue ? [] : [{ label, before: beforeValue, after: afterValue }],
  );
  const compiledPromptChanged = (before.compiledPrompt ?? "") !== (after.compiledPrompt ?? "");
  const hasChanges =
    dials.length > 0 ||
    agendas.added.length > 0 ||
    agendas.removed.length > 0 ||
    values.added.length > 0 ||
    values.removed.length > 0 ||
    resources.length > 0 ||
    fields.length > 0 ||
    compiledPromptChanged;

  return { dials, agendas, values, resources, fields, compiledPromptChanged, hasChanges };
}
