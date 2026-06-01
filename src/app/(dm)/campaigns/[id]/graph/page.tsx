import Link from "next/link";
import { notFound } from "next/navigation";
import { Network } from "lucide-react";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getCampaignRelationshipGraph } from "@/server/services/relationships";
import { Kicker } from "@/components/ui/kicker";
import { RelationshipGraph } from "@/components/graph/relationship-graph";

export default async function RelationshipGraphPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  // Not a member (or doesn't exist) -> 404, never leak existence.
  if (!campaign) notFound();

  const graph = await getCampaignRelationshipGraph(user.id, id);
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-1)] px-5 py-3">
        <div>
          <Kicker dim noLead>
            Relationship graph
          </Kicker>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            {campaign.name}
          </h1>
        </div>
        <span className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]">
          {nodes.length} entities · {edges.length} connections
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {edges.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-[var(--ink-faint)]">
            <div>
              <Network aria-hidden size={36} className="mx-auto opacity-40" />
              <p className="mt-3 text-sm">
                No connections yet. Link entities from the Connections panel on
                any entity to build the graph.
              </p>
              <Link
                href={`/campaigns/${id}`}
                className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em] text-[var(--accent)] hover:underline"
              >
                Open the World Browser
              </Link>
            </div>
          </div>
        ) : (
          <RelationshipGraph campaignId={id} nodes={nodes} edges={edges} />
        )}
      </div>
    </div>
  );
}
