"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Eye, Plus, X } from "lucide-react";

import {
  grantEntityKnownToAction,
  grantEntityKnowsAboutAction,
  revokeKnowledgeAction,
} from "@/app/(dm)/actions";
import {
  EntityTypeahead,
  type EntityCandidate,
} from "@/components/entities/entity-typeahead";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import type { KnowledgeGrantView } from "@/server/services/knowledge";

// The fog-of-war Knowledge panel (M3). A DM curates private reveals on the entity
// detail page: which actor entities have been *told about* this entity ("known
// to"), and which canon this entity itself *knows about* ("knows about"). These
// grants are deliberate, audited reveals — not campaign-wide visibility — and
// feed the M7 player "known world" and M11 agent fog-of-war.

type GrantAction = (
  campaignId: string,
  entityId: string,
  prev: { error?: string } | undefined,
  formData: FormData,
) => Promise<{ error?: string } | undefined>;

function AddButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:opacity-50"
    >
      <Plus aria-hidden size={12} />
      {pending ? "Revealing..." : "Reveal"}
    </button>
  );
}

function AddKnowledgeForm({
  candidates,
  pickerLabel,
  onSubmit,
  onCancel,
  error,
}: {
  candidates: EntityCandidate[];
  pickerLabel: string;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  error: string | null;
}) {
  const [picked, setPicked] = useState<EntityCandidate | null>(null);
  return (
    <form action={onSubmit} className="mt-3 flex flex-col gap-2">
      <EntityTypeahead
        name="entityId"
        candidates={candidates}
        value={picked}
        onChange={setPicked}
        placeholder={pickerLabel}
        autoFocus
      />
      <input
        name="notes"
        maxLength={500}
        placeholder="Notes (optional)"
        aria-label="Reveal notes"
        className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)]"
      />
      {error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <AddButton disabled={!picked} />
        <button
          type="button"
          onClick={onCancel}
          className="border border-[var(--line)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function KnowledgeSection({
  campaignId,
  entityId,
  title,
  emptyText,
  pickerLabel,
  addLabel,
  grants,
  candidates,
  action,
}: {
  campaignId: string;
  entityId: string;
  title: string;
  emptyText: string;
  pickerLabel: string;
  addLabel: string;
  grants: KnowledgeGrantView[];
  candidates: EntityCandidate[];
  action: GrantAction;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hide entities already granted in this direction so the picker can't propose a
  // duplicate (the service dedupes anyway, but the list stays clean).
  const grantedIds = new Set(grants.map((g) => g.entity.id));
  const pickable = candidates.filter((c) => !grantedIds.has(c.id));

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    const res = await action(campaignId, entityId, undefined, formData);
    if (res?.error) setError(res.error);
    else setOpen(false);
  };

  return (
    <div>
      <Kicker dim noLead className="mb-2">
        {title} · {grants.length}
      </Kicker>

      {grants.length === 0 && (
        <p className="text-xs text-[var(--ink-faint)]">{emptyText}</p>
      )}

      <div className="flex flex-col gap-[6px]">
        {grants.map((grant) => (
          <div
            key={grant.id}
            className="flex items-start gap-2 border border-[var(--line)] px-[10px] py-[8px]"
          >
            <Link
              href={`/campaigns/${campaignId}/entities/${grant.entity.id}`}
              className="min-w-0 flex-1"
            >
              <div className="flex items-center gap-[7px]">
                <TypeDot type={grant.entity.type} size={7} />
                <span className="truncate text-[12.5px] font-semibold text-[var(--ink)]">
                  {grant.entity.name}
                </span>
              </div>
              {grant.notes && (
                <p className="mt-[3px] text-[11px] leading-[1.45] text-[var(--ink-dim)]">
                  {grant.notes}
                </p>
              )}
            </Link>
            <form
              action={revokeKnowledgeAction.bind(null, campaignId, entityId, grant.id)}
            >
              <button
                type="submit"
                aria-label="Revoke reveal"
                title="Revoke reveal"
                className="inline-flex items-center p-[3px] text-[var(--ink-faint)] opacity-60 transition-opacity hover:text-[var(--no)] hover:opacity-100"
              >
                <X aria-hidden size={12} />
              </button>
            </form>
          </div>
        ))}
      </div>

      {pickable.length === 0 ? (
        grants.length === 0 ? (
          <p className="mt-2 font-mono text-[10px] leading-[1.5] text-[var(--ink-faint)]">
            Create another entity to reveal.
          </p>
        ) : null
      ) : open ? (
        <AddKnowledgeForm
          candidates={pickable}
          pickerLabel={pickerLabel}
          onSubmit={handleSubmit}
          onCancel={() => {
            setError(null);
            setOpen(false);
          }}
          error={error}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="mt-2 inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110"
        >
          <Plus aria-hidden size={12} />
          {addLabel}
        </button>
      )}
    </div>
  );
}

export function KnowledgePanel({
  campaignId,
  entityId,
  entityName,
  knownTo,
  knowsAbout,
  candidates,
}: {
  campaignId: string;
  entityId: string;
  entityName: string;
  knownTo: KnowledgeGrantView[];
  knowsAbout: KnowledgeGrantView[];
  candidates: EntityCandidate[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-[7px]">
        <Eye aria-hidden size={13} className="text-[var(--ink-faint)]" />
        <Kicker dim noLead>
          Knowledge
        </Kicker>
      </div>
      <p className="mb-3 font-mono text-[9.5px] leading-[1.5] text-[var(--ink-faint)]">
        Private reveals — who knows {entityName}, and what it knows. Not
        campaign-wide visibility.
      </p>
      <div className="flex flex-col gap-5">
        <KnowledgeSection
          campaignId={campaignId}
          entityId={entityId}
          title="Known to"
          emptyText="No one has been told about this yet."
          pickerLabel="Reveal to entity…"
          addLabel="Reveal to…"
          grants={knownTo}
          candidates={candidates}
          action={grantEntityKnownToAction}
        />
        <KnowledgeSection
          campaignId={campaignId}
          entityId={entityId}
          title="Knows about"
          emptyText="This entity hasn't been told about anything yet."
          pickerLabel="Reveal canon to this entity…"
          addLabel="Add knowledge…"
          grants={knowsAbout}
          candidates={candidates}
          action={grantEntityKnowsAboutAction}
        />
      </div>
    </div>
  );
}
