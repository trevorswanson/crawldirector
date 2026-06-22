import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, LockOpen, Plus, Sparkles } from "lucide-react";

import { Role } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import {
  getPersonaStudio,
  type PersonaSnapshotView,
} from "@/server/services/persona";
import {
  activatePersonaSnapshotAction,
  togglePersonaPromptLockAction,
} from "@/app/(dm)/actions";
import { ConsoleScreen, ScreenHeader, ScreenRail } from "@/components/console/screen";
import { PersonaEditor, type PersonaFormValues } from "@/components/persona/persona-editor";
import { PersonaSnapshotDiffPanel } from "@/components/persona/persona-snapshot-diff";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { diffPersonaSnapshots } from "@/lib/persona-diff";

function toFormValues(snapshot: PersonaSnapshotView): PersonaFormValues {
  return {
    label: snapshot.label ?? "",
    dials: snapshot.dials,
    values: snapshot.values.join("\n"),
    overtAgendas: snapshot.overtAgendas.join("\n"),
    secretAgendas: snapshot.secretAgendas.join("\n"),
    resources: snapshot.resources.map((r) => `${r.key}: ${r.value}`).join("\n"),
    knowledgeScope: snapshot.knowledgeScope,
    voiceGuide: snapshot.voiceGuide ?? "",
    constraints: snapshot.constraints ?? "",
    isActive: snapshot.isActive,
  };
}

export default async function PersonaStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ entity?: string; snapshot?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);
  if (!campaign) notFound();

  const role = campaign.members[0]?.role;
  if (role !== Role.OWNER && role !== Role.CO_DM) notFound();

  const studio = await getPersonaStudio(user.id, id, query.entity);

  // No System AI entity yet — point the DM at the World Browser rather than
  // faking a persona surface (AGENTS.md: never ship filler data).
  if (studio.entities.length === 0) {
    return (
      <ConsoleScreen>
        <ScreenHeader kicker={campaign.name} title="Persona Studio" />
        <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
          <div className="max-w-[680px]">
            <Panel>
              <div className="px-[18px] py-7">
                <p className="font-display text-[17px] font-semibold">
                  No System AI entity yet.
                </p>
                <p className="mt-2 max-w-prose text-[13px] leading-[1.6] text-[var(--ink-dim)]">
                  The Persona Studio tunes the dungeon&rsquo;s System AI — the
                  in-fiction generator behind encounters, bosses, loot, and System
                  messages. Create a <span className="text-[var(--ink)]">System AI</span>{" "}
                  entity in the World Browser first, then return here to author its
                  evolving persona.
                </p>
                <Link
                  href={`/campaigns/${id}`}
                  className="mt-4 inline-flex border border-[var(--line-strong)] bg-[var(--bg-3)] px-3 py-2 font-mono text-[11px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Open World Browser
                </Link>
              </div>
            </Panel>
          </div>
        </div>
      </ConsoleScreen>
    );
  }

  const selectedEntityId = studio.selectedEntityId!;
  const selectedEntity = studio.entities.find((e) => e.id === selectedEntityId)!;
  const creating =
    query.snapshot === "new" || studio.snapshots.length === 0;
  const selectedSnapshot = creating
    ? null
    : studio.snapshots.find((s) => s.id === query.snapshot) ??
      studio.snapshots.find((s) => s.isActive) ??
      studio.snapshots[0];
  const selectedSnapshotIndex = selectedSnapshot
    ? studio.snapshots.findIndex((snapshot) => snapshot.id === selectedSnapshot.id)
    : -1;
  const previousSnapshot =
    selectedSnapshotIndex >= 0 ? studio.snapshots[selectedSnapshotIndex + 1] ?? null : null;
  const snapshotDiff =
    selectedSnapshot && previousSnapshot
      ? diffPersonaSnapshots(previousSnapshot, selectedSnapshot)
      : null;

  const initial: PersonaFormValues = selectedSnapshot
    ? toFormValues(selectedSnapshot)
    : {
        label: "",
        dials: {},
        values: "",
        overtAgendas: "",
        secretAgendas: "",
        resources: "",
        knowledgeScope: "OMNISCIENT",
        voiceGuide: "",
        constraints: "",
        // The first persona authored for an entity becomes active by default.
        isActive: studio.activeSnapshotId === null,
      };

  const rail = (
    <ScreenRail kicker="Persona Studio" caption={campaign.name}>
      <div className="border-b border-[var(--line)] px-3 py-3">
        <p className="kicker dim mb-2 px-1 text-[9px]">System AI</p>
        <div className="grid gap-1">
          {studio.entities.map((entity) => {
            const active = entity.id === selectedEntityId;
            return (
              <Link
                key={entity.id}
                href={`/campaigns/${id}/persona?entity=${entity.id}`}
                className={`truncate border-l-2 px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--bg-3)] font-semibold text-[var(--ink)]"
                    : "border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]"
                }`}
              >
                {entity.name}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="kicker dim text-[9px]">Snapshots</p>
          <Link
            href={`/campaigns/${id}/persona?entity=${selectedEntityId}&snapshot=new`}
            className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.08em] transition-colors ${
              creating
                ? "text-[var(--accent)]"
                : "text-[var(--ink-faint)] hover:text-[var(--accent)]"
            }`}
          >
            <Plus aria-hidden size={12} /> New
          </Link>
        </div>
        {studio.snapshots.length === 0 ? (
          <p className="px-1 text-[12px] text-[var(--ink-faint)]">
            No snapshots yet — author the first persona.
          </p>
        ) : (
          <div className="grid gap-1">
            {studio.snapshots.map((snapshot) => {
              const active = !creating && snapshot.id === selectedSnapshot?.id;
              return (
                <Link
                  key={snapshot.id}
                  href={`/campaigns/${id}/persona?entity=${selectedEntityId}&snapshot=${snapshot.id}`}
                  className={`border-l-2 px-3 py-2 transition-colors ${
                    active
                      ? "border-[var(--accent)] bg-[var(--bg-3)]"
                      : "border-transparent hover:bg-[var(--bg-2)]"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] text-[var(--ink)]">
                      {snapshot.label || "Untitled snapshot"}
                    </span>
                    {snapshot.promptLocked && (
                      <Lock aria-label="Prompt locked" size={11} className="shrink-0 text-[var(--sys)]" />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.07em] text-[var(--ink-faint)]">
                    {snapshot.isActive && <span className="text-[var(--ok)]">● active</span>}
                    <span>{snapshot.createdAt.toLocaleDateString()}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </ScreenRail>
  );

  return (
    <ConsoleScreen rail={rail}>
      <ScreenHeader
        kicker={selectedEntity.name}
        title={creating ? "New persona snapshot" : selectedSnapshot?.label || "Persona snapshot"}
        actions={
          selectedSnapshot ? (
            <div className="flex flex-wrap items-center gap-2">
              {selectedSnapshot.isActive ? (
                <span className="border border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ok)]">
                  Active persona
                </span>
              ) : (
                <form
                  action={activatePersonaSnapshotAction.bind(
                    null,
                    id,
                    selectedSnapshot.id,
                    selectedSnapshot.version,
                  )}
                >
                  <Button type="submit" variant="outline" size="sm">
                    Make active
                  </Button>
                </form>
              )}
              <form
                action={togglePersonaPromptLockAction.bind(
                  null,
                  id,
                  selectedSnapshot.id,
                  selectedSnapshot.version,
                  !selectedSnapshot.promptLocked,
                )}
              >
                <Button type="submit" variant="outline" size="sm" className="gap-1.5">
                  {selectedSnapshot.promptLocked ? (
                    <>
                      <LockOpen aria-hidden size={13} /> Unlock prompt
                    </>
                  ) : (
                    <>
                      <Lock aria-hidden size={13} /> Lock prompt
                    </>
                  )}
                </Button>
              </form>
            </div>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
        <div className="grid max-w-[860px] gap-6">
          <p className="max-w-prose text-[13px] leading-[1.6] text-[var(--ink-dim)]">
            Tune the System AI&rsquo;s dials, agendas, and voice. The compiled prompt
            below is what persona-aware generators inject — so bosses, loot, and
            System messages sound like the System AI does right now. Changes are
            recorded as reviewable canon with full provenance.
          </p>

          {!creating && selectedSnapshot && (
            <PersonaSnapshotDiffPanel
              previousLabel={previousSnapshot?.label || (previousSnapshot ? "Untitled snapshot" : null)}
              diff={snapshotDiff}
            />
          )}

          {selectedSnapshot?.promptLocked && (
            <p className="border border-[color-mix(in_srgb,var(--sys)_45%,transparent)] bg-[color-mix(in_srgb,var(--sys)_10%,transparent)] px-3 py-2 text-[12px] text-[var(--sys)]">
              The compiled prompt is locked. Saving still updates the dials and
              agendas, but the stored prompt below stays frozen until you unlock it.
            </p>
          )}

          <Panel>
            <PanelHeader
              kicker={creating ? "Author" : "Edit"}
              title={creating ? "New persona snapshot" : "Persona dials & voice"}
              sub={
                creating
                  ? "Author a new point on this System AI's arc."
                  : "Edit this snapshot. Optimistic-locked on its version."
              }
            />
            <div className="px-[18px] py-5">
              <PersonaEditor
                key={`${selectedEntityId}:${selectedSnapshot?.id ?? "new"}`}
                campaignId={id}
                entityId={selectedEntityId}
                snapshotId={selectedSnapshot?.id}
                baseVersion={selectedSnapshot?.version}
                initial={initial}
                fullyLocked={selectedSnapshot?.locked ?? false}
              />
            </div>
          </Panel>

          {selectedSnapshot && (
            <Panel>
              <PanelHeader
                kicker="Generators read this"
                title={
                  <span className="inline-flex items-center gap-2">
                    <Sparkles aria-hidden size={15} className="text-[var(--ai)]" />
                    Stored compiled prompt
                  </span>
                }
                sub="The canonical fragment injected into persona-aware generation."
                right={
                  selectedSnapshot.originChangeSetId ? (
                    <Link
                      href={`/campaigns/${id}/review?reopened=${selectedSnapshot.originChangeSetId}`}
                      className="font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
                    >
                      View in Review Queue
                    </Link>
                  ) : undefined
                }
              />
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-[18px] py-4 font-mono text-[11.5px] leading-[1.55] text-[var(--ink-dim)]">
                {selectedSnapshot.compiledPrompt || "(empty)"}
              </pre>
            </Panel>
          )}
        </div>
      </div>
    </ConsoleScreen>
  );
}
