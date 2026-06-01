import Link from "next/link";
import { notFound } from "next/navigation";
import { Network } from "lucide-react";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getCampaignRelationshipGraph } from "@/server/services/relationships";
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

  if (edges.length === 0) {
    return (
      <div className="grid h-full place-items-center text-center text-[var(--ink-faint)]">
        <div>
          <Network aria-hidden size={36} className="mx-auto opacity-40" />
          <p className="mt-3 text-sm">
            No connections yet. Link entities from the Connections panel on any
            entity to build the graph.
          </p>
          <Link
            href={`/campaigns/${id}`}
            className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[.08em] text-[var(--accent)] hover:underline"
          >
            Open the World Browser
          </Link>
        </div>
      </div>
    );
  }

  return <RelationshipGraph campaignId={id} nodes={nodes} edges={edges} />;
}
