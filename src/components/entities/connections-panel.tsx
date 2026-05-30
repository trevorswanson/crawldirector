"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowRight, Plus, X } from "lucide-react";

import {
  archiveRelationshipAction,
  createRelationshipAction,
  type RelationshipActionState,
} from "@/app/(dm)/actions";
import { Kicker } from "@/components/ui/kicker";
import { TypeDot } from "@/components/ui/type-dot";
import { relationshipTypeValues } from "@/lib/validation";
import type { EntityConnection } from "@/server/services/relationships";

export type ConnectionCandidate = { id: string; name: string; type: string };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110 disabled:opacity-50"
    >
      <Plus aria-hidden size={12} />
      {pending ? "Adding..." : "Add connection"}
    </button>
  );
}

export function ConnectionsPanel({
  campaignId,
  entityId,
  connections,
  candidates,
}: {
  campaignId: string;
  entityId: string;
  connections: EntityConnection[];
  candidates: ConnectionCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<RelationshipActionState, FormData>(
    createRelationshipAction.bind(null, campaignId, entityId),
    undefined,
  );

  return (
    <div>
      <Kicker dim noLead className="mb-3">
        Connections · {connections.length}
      </Kicker>

      {connections.length === 0 && (
        <p className="text-xs text-[var(--ink-faint)]">No relationships yet.</p>
      )}

      <div className="flex flex-col gap-[6px]">
        {connections.map((c) => (
          <div
            key={c.id}
            className="group flex items-start gap-2 border border-[var(--line)] px-[10px] py-[9px]"
          >
            <Link
              href={`/campaigns/${campaignId}/entities/${c.other.id}`}
              className="min-w-0 flex-1"
            >
              <div className="mb-[5px] flex items-center gap-[6px]">
                <ArrowRight
                  aria-hidden
                  size={11}
                  className={c.direction === "in" ? "rotate-180" : ""}
                  style={{ color: "var(--ink-faint)" }}
                />
                <span
                  className="font-mono text-[9.5px] tracking-[.04em]"
                  style={{ color: c.secret ? "var(--hot)" : "var(--accent)" }}
                >
                  {c.type}
                  {c.secret ? " · secret" : ""}
                </span>
              </div>
              <div className="flex items-center gap-[7px]">
                <TypeDot type={c.other.type} size={7} />
                <span className="truncate text-[12.5px] font-semibold text-[var(--ink)]">
                  {c.other.name}
                </span>
              </div>
            </Link>
            <form
              action={archiveRelationshipAction.bind(
                null,
                campaignId,
                entityId,
                c.id,
              )}
            >
              <button
                type="submit"
                title="Remove connection"
                className="inline-flex items-center p-[3px] text-[var(--ink-faint)] opacity-60 transition-opacity hover:text-[var(--no)] hover:opacity-100"
              >
                <X aria-hidden size={12} />
              </button>
            </form>
          </div>
        ))}
      </div>

      {candidates.length === 0 ? (
        <p className="mt-3 font-mono text-[10px] leading-[1.5] text-[var(--ink-faint)]">
          Create another entity to connect this one to it.
        </p>
      ) : open ? (
        <form action={formAction} className="mt-3 flex flex-col gap-2">
          <select
            name="type"
            defaultValue="ALLY_OF"
            className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] font-mono text-[11px] text-[var(--ink)]"
          >
            {relationshipTypeValues.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            name="targetId"
            defaultValue=""
            required
            className="border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[11.5px] text-[var(--ink)]"
          >
            <option value="" disabled>
              Select entity…
            </option>
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-dim)]">
            <input type="checkbox" name="secret" value="true" />
            DM-only (secret)
          </label>
          {state?.error && (
            <p role="alert" className="text-[11px] text-[var(--no)]">
              {state.error}
            </p>
          )}
          <div className="flex gap-2">
            <AddButton />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="border border-[var(--line)] px-[10px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110"
        >
          <Plus aria-hidden size={12} />
          Add connection
        </button>
      )}
    </div>
  );
}
