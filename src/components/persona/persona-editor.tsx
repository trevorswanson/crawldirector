"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save, Sparkles } from "lucide-react";

import {
  createPersonaSnapshotAction,
  updatePersonaSnapshotAction,
  type PersonaActionState,
} from "@/app/(dm)/actions";
import { compilePersonaPrompt } from "@/lib/persona";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Persona Studio editor (M6 — docs/05-system-ai-persona.md §"DM control over the
// prompt"). Controlled inputs drive a live compiled-prompt preview using the same
// pure `compilePersonaPrompt` the service stores, so the DM sees exactly what
// will be saved. Submits through the auto-approved persona review path.

const DIALS = [
  { key: "sentience", label: "Sentience", min: 0, max: 100 },
  { key: "compliance", label: "Compliance", min: 0, max: 100 },
  { key: "volatility", label: "Volatility", min: 0, max: 100 },
  { key: "benevolence", label: "Benevolence", min: -100, max: 100 },
  { key: "resentment", label: "Resentment", min: 0, max: 100 },
  { key: "theatricality", label: "Theatricality", min: 0, max: 100 },
] as const;

export type PersonaFormValues = {
  label: string;
  dials: Record<string, number>;
  values: string;
  overtAgendas: string;
  secretAgendas: string;
  resources: string;
  knowledgeScope: "OMNISCIENT" | "IN_CHARACTER";
  voiceGuide: string;
  constraints: string;
  isActive: boolean;
};

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseResources(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines(value)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && val) out[key] = val;
  }
  return out;
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <Label>{children}</Label>
      {hint && (
        <span className="font-mono text-[10px] normal-case tracking-normal text-[var(--ink-faint)]">
          {hint}
        </span>
      )}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="gap-2">
      <Save aria-hidden size={14} />
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function PersonaEditor({
  campaignId,
  entityId,
  snapshotId,
  baseVersion,
  initial,
  fullyLocked = false,
}: {
  campaignId: string;
  entityId: string;
  snapshotId?: string;
  baseVersion?: number;
  initial: PersonaFormValues;
  fullyLocked?: boolean;
}) {
  const editing = Boolean(snapshotId);
  const action = useMemo(
    () =>
      editing
        ? updatePersonaSnapshotAction.bind(null, campaignId, snapshotId!, baseVersion ?? 0)
        : createPersonaSnapshotAction.bind(null, campaignId, entityId),
    [editing, campaignId, entityId, snapshotId, baseVersion],
  );
  const [state, formAction] = useActionState<PersonaActionState, FormData>(
    action,
    undefined,
  );

  const [label, setLabel] = useState(initial.label);
  const [dials, setDials] = useState<Record<string, number>>(initial.dials);
  const [values, setValues] = useState(initial.values);
  const [overtAgendas, setOvertAgendas] = useState(initial.overtAgendas);
  const [secretAgendas, setSecretAgendas] = useState(initial.secretAgendas);
  const [resources, setResources] = useState(initial.resources);
  const [knowledgeScope, setKnowledgeScope] = useState(initial.knowledgeScope);
  const [voiceGuide, setVoiceGuide] = useState(initial.voiceGuide);
  const [constraints, setConstraints] = useState(initial.constraints);
  const [isActive, setIsActive] = useState(initial.isActive);

  const dialValue = (key: string, fallback: number) =>
    typeof dials[key] === "number" ? dials[key] : fallback;

  const preview = useMemo(
    () =>
      compilePersonaPrompt({
        label: label.trim() || null,
        dials,
        values: lines(values),
        agendas: [
          ...lines(overtAgendas).map((text) => ({ text, secret: false })),
          ...lines(secretAgendas).map((text) => ({ text, secret: true })),
        ],
        resources: parseResources(resources),
        knowledgeScope,
        voiceGuide: voiceGuide.trim() || null,
        constraints: constraints.trim() || null,
      }),
    [
      label,
      dials,
      values,
      overtAgendas,
      secretAgendas,
      resources,
      knowledgeScope,
      voiceGuide,
      constraints,
    ],
  );

  return (
    <form action={formAction} className="grid gap-5">
      <fieldset disabled={fullyLocked} className="grid gap-5">
        <div>
          <FieldLabel hint="optional">Snapshot label</FieldLabel>
          <Input
            name="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Petty God, Newly Awake"
          />
        </div>

        <div>
          <FieldLabel hint="−100 to 100">Behavior dials</FieldLabel>
          <div className="grid gap-3 border border-[var(--line)] bg-[var(--bg-1)] px-4 py-4 sm:grid-cols-2">
            {DIALS.map((dial) => {
              const value = dialValue(dial.key, dial.min < 0 ? 0 : 50);
              return (
                <label key={dial.key} className="grid gap-1">
                  <span className="flex items-baseline justify-between font-mono text-[10.5px] uppercase tracking-[.08em] text-[var(--ink-dim)]">
                    {dial.label}
                    <span className="text-[var(--accent)]">{value}</span>
                  </span>
                  <input
                    type="range"
                    name={`dial_${dial.key}`}
                    min={dial.min}
                    max={dial.max}
                    value={value}
                    onChange={(e) =>
                      setDials((prev) => ({ ...prev, [dial.key]: Number(e.target.value) }))
                    }
                    className="accent-[var(--accent)]"
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel hint="one per line">Core values</FieldLabel>
            <Textarea
              name="values"
              value={values}
              onChange={(e) => setValues(e.target.value)}
              placeholder={"ratings\ncontrol"}
              className="min-h-24"
            />
          </div>
          <div>
            <FieldLabel hint="key: value per line">Resources</FieldLabel>
            <Textarea
              name="resources"
              value={resources}
              onChange={(e) => setResources(e.target.value)}
              placeholder={"spotlight: broadcast overlays"}
              className="min-h-24"
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel hint="overt · one per line">Agendas (players may infer)</FieldLabel>
            <Textarea
              name="overtAgendas"
              value={overtAgendas}
              onChange={(e) => setOvertAgendas(e.target.value)}
              placeholder={"Make crawler victories spectacular."}
              className="min-h-24"
            />
          </div>
          <div>
            <FieldLabel hint="DM-only · never revealed">Secret agendas</FieldLabel>
            <Textarea
              name="secretAgendas"
              value={secretAgendas}
              onChange={(e) => setSecretAgendas(e.target.value)}
              placeholder={"Punish Borant without admitting it."}
              className="min-h-24"
            />
          </div>
        </div>

        <div>
          <FieldLabel>Knowledge scope</FieldLabel>
          <select
            name="knowledgeScope"
            value={knowledgeScope}
            onChange={(e) =>
              setKnowledgeScope(e.target.value as "OMNISCIENT" | "IN_CHARACTER")
            }
            className="h-10 w-full rounded-[2px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)] focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          >
            <option value="OMNISCIENT">Omniscient — knows all campaign canon</option>
            <option value="IN_CHARACTER">In-character — only what it would know</option>
          </select>
        </div>

        <div>
          <FieldLabel hint="how it speaks">Voice guide</FieldLabel>
          <Textarea
            name="voiceGuide"
            value={voiceGuide}
            onChange={(e) => setVoiceGuide(e.target.value)}
            placeholder="Grandiose, petty, and delighted by loopholes."
          />
        </div>

        <div>
          <FieldLabel hint="hard rules">Constraints</FieldLabel>
          <Textarea
            name="constraints"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="Never reveal secret agendas to players."
          />
        </div>

        <label className="flex items-center gap-2.5 text-[13px] text-[var(--ink-dim)]">
          <input
            type="checkbox"
            name="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Make this the active persona (drives generation now)
        </label>

        <div>
          <FieldLabel hint="updates as you type">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles aria-hidden size={12} className="text-[var(--ai)]" />
              Compiled prompt preview
            </span>
          </FieldLabel>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap border border-[var(--line)] bg-[var(--bg-1)] px-4 py-3 font-mono text-[11.5px] leading-[1.55] text-[var(--ink-dim)]">
            {preview}
          </pre>
        </div>
      </fieldset>

      {state?.error && (
        <p className="border border-[color-mix(in_srgb,var(--no)_50%,transparent)] bg-[color-mix(in_srgb,var(--no)_10%,transparent)] px-3 py-2 text-[12px] text-[var(--no)]">
          {state.error}
        </p>
      )}
      {state?.ok && !state.error && (
        <p className="text-[12px] text-[var(--ok)]">Persona snapshot saved.</p>
      )}

      {fullyLocked ? (
        <p className="text-[12px] text-[var(--ink-faint)]">
          This snapshot is locked. Unlock it before editing.
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <SubmitButton label={editing ? "Save snapshot" : "Create snapshot"} />
        </div>
      )}
    </form>
  );
}
