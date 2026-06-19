"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Wrench } from "lucide-react";

import {
  enqueueMigrateEntityDataAction,
  type GenerateActionState,
} from "@/app/(dm)/actions";

type ActiveDataRepairJob = {
  id: string;
  status: "QUEUED" | "RUNNING";
  createdAt: Date;
  startedAt: Date | null;
};

function RepairSubmit({ activeStatus }: { activeStatus?: "QUEUED" | "RUNNING" }) {
  const { pending } = useFormStatus();
  const activeLabel =
    activeStatus === "RUNNING"
      ? "Repair running"
      : activeStatus === "QUEUED"
        ? "Repair queued"
        : null;

  return (
    <button
      type="submit"
      disabled={pending || Boolean(activeStatus)}
      className="inline-flex items-center gap-[6px] border px-[12px] py-[6px] font-mono text-[10px] uppercase tracking-[.08em] transition-[filter,color] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: "var(--sys)",
        background: "color-mix(in srgb, var(--sys) 12%, transparent)",
        color: "var(--sys)",
      }}
    >
      <Wrench aria-hidden size={12} />
      {pending ? "Queuing repair…" : (activeLabel ?? "Repair data versions")}
    </button>
  );
}

export function MigrateEntityDataButton({
  campaignId,
  activeJob = null,
}: {
  campaignId: string;
  activeJob?: ActiveDataRepairJob | null;
}) {
  const [state, action] = useActionState<GenerateActionState, FormData>(
    enqueueMigrateEntityDataAction.bind(null, campaignId),
    undefined,
  );
  const activeStatus = state?.activeJobStatus ?? activeJob?.status;
  const activeMessage =
    activeStatus === "RUNNING"
      ? "Data repair is running. Check the Job Queue for status."
      : activeStatus === "QUEUED"
        ? "Data repair is queued. Check the Job Queue for status."
        : null;

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <RepairSubmit activeStatus={activeStatus} />
      {state?.error && (
        <p role="alert" className="text-[11px] text-[var(--no)]">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-[11px] text-[var(--ok)]">{state.success}</p>}
      {!state?.success && activeMessage && (
        <p className="text-[11px] text-[var(--ink-faint)]">{activeMessage}</p>
      )}
    </form>
  );
}
