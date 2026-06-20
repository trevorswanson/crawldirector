"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { BulkFleshPanel, type BulkFleshCandidate, type RecentBulkJob } from "@/components/entities/bulk-flesh-panel";
import { GeneratePanel } from "@/components/entities/generate-panel";
import { ScaffoldStubsPanel } from "@/components/entities/scaffold-stubs-panel";
import { Dialog } from "@/components/ui/dialog";
import { Kicker } from "@/components/ui/kicker";

type EntityAiActionsProps = {
  variant: "entity";
  campaignId: string;
  entityId: string;
  locked: boolean;
};

type WorldAiActionsProps = {
  variant: "world";
  campaignId: string;
  candidates: BulkFleshCandidate[];
  recentJobs?: RecentBulkJob[];
};

type AiActionsDialogProps = EntityAiActionsProps | WorldAiActionsProps;

function ActionSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-[var(--line)] bg-[var(--bg-2)] p-4">
      <Kicker dim noLead className="mb-3">
        {title}
      </Kicker>
      {children}
    </section>
  );
}

/** Consolidated, icon-only AI entry point for World Browser and entity detail views. */
export function AiActionsDialog(props: AiActionsDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="AI actions"
        title="AI actions"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center border border-[var(--ai)] bg-[color-mix(in_srgb,var(--ai)_12%,transparent)] text-[var(--ai)] transition-[filter,color] hover:brightness-110"
      >
        <Sparkles aria-hidden size={15} />
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="AI actions">
        <div className="space-y-4">
          {props.variant === "entity" ? (
            <ActionSection title="Entity generation">
              <GeneratePanel
                campaignId={props.campaignId}
                entityId={props.entityId}
                locked={props.locked}
                showHeading={false}
              />
            </ActionSection>
          ) : (
            <>
              <ActionSection title="Scaffold stubs">
                <ScaffoldStubsPanel campaignId={props.campaignId} embedded />
              </ActionSection>
              {props.candidates.length > 0 && (
                <ActionSection title="Bulk flesh-out">
                  <BulkFleshPanel
                    campaignId={props.campaignId}
                    candidates={props.candidates}
                    recentJobs={props.recentJobs}
                    embedded
                  />
                </ActionSection>
              )}
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
