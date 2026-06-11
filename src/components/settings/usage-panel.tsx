"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Coins, Gauge } from "lucide-react";

import {
  setSpendCapAction,
  type SettingsActionState,
} from "@/app/(dm)/campaigns/[id]/settings/actions";
import { formatUsd } from "@/lib/ai/pricing";
import type { CampaignAiUsage } from "@/server/services/ai-usage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/panel";

// AI usage + spend cap settings (M4 — docs/04-ai-integration.md). Shows what
// generation has cost this campaign (estimated from list prices) and lets the DM
// set a spend cap that blocks further generation once known spend reaches it.
// Costs are estimates; token counts are exact. DM-facing only.

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save cap"}
    </Button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-[var(--ink)]">
        {value}
      </div>
    </div>
  );
}

export function UsagePanel({
  campaignId,
  usage,
}: {
  campaignId: string;
  usage: CampaignAiUsage;
}) {
  const [state, formAction] = useActionState<SettingsActionState, FormData>(
    setSpendCapAction.bind(null, campaignId),
    undefined,
  );

  const hasRuns = usage.runCount > 0;

  return (
    <Panel className="mt-6">
      <PanelHeader
        kicker="Usage & spend"
        title="What generation is costing"
        sub="Estimated from provider list prices — token counts are exact, dollar figures are approximate. Generation never runs once a spend cap is reached."
      />

      <div className="border-b border-[var(--line)] px-[18px] py-4">
        {hasRuns ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Est. spend" value={formatUsd(usage.totalCostUsd)} />
            <Stat label="Runs" value={usage.runCount.toLocaleString()} />
            <Stat label="Input tokens" value={usage.totalInputTokens.toLocaleString()} />
            <Stat label="Output tokens" value={usage.totalOutputTokens.toLocaleString()} />
          </div>
        ) : (
          <p className="text-[12px] text-[var(--ink-faint)]">
            No generations yet. Usage and estimated cost will appear here after the
            first AI run.
          </p>
        )}
        {usage.unpricedRunCount > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--ink-faint)]">
            <Coins aria-hidden size={12} />
            <span>
              {usage.unpricedRunCount === 1
                ? "1 run on an unpriced model isn’t"
                : `${usage.unpricedRunCount.toLocaleString()} runs on an unpriced model aren’t`}{" "}
              included in the estimate (tokens still counted).
            </span>
          </p>
        )}
      </div>

      <form action={formAction} className="px-[18px] py-4">
        <div className="flex items-center gap-2">
          <Gauge aria-hidden size={14} className="text-[var(--ink-faint)]" />
          <span className="text-[13px] font-semibold text-[var(--ink)]">Spend cap</span>
        </div>
        <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
          {usage.spendCapUsd == null
            ? "No cap set — generation isn't limited by spend."
            : `Capped at ${formatUsd(usage.spendCapUsd)}. Leave blank and save to remove it.`}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 sm:flex-1">
            <span className="text-[13px] text-[var(--ink-dim)]">$</span>
            <Input
              type="number"
              name="spendCapUsd"
              min="0"
              step="0.01"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={usage.spendCapUsd ?? ""}
              placeholder="e.g. 5.00 (blank = no cap)"
              aria-label="AI spend cap in US dollars"
              className="sm:flex-1"
            />
          </div>
          <SaveButton />
        </div>
        {state?.error && (
          <p role="alert" className="mt-2 text-[11px] text-[var(--no)]">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="mt-2 text-[11px] text-[var(--ok)]">{state.success}</p>
        )}
      </form>
    </Panel>
  );
}
