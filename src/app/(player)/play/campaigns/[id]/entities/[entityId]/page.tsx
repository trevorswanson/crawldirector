import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ArrowRight } from "lucide-react";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getEntityForUser } from "@/server/services/entities";
import { listConnectionsForEntity } from "@/server/services/relationships";
import { Kicker } from "@/components/ui/kicker";
import { Markdown } from "@/components/ui/markdown";
import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType, isAvatarImageType } from "@/lib/entities";
import { relationshipEdgeLabel } from "@/lib/relationship-types";
import { cn } from "@/lib/utils";

export default async function PlayerEntityPage({
  params,
}: {
  params: Promise<{ id: string; entityId: string }>;
}) {
  const { id, entityId } = await params;
  const user = await requireUser();
  const [campaign, entity] = await Promise.all([
    getCampaignForUser(user.id, id),
    // Player-scoped read: returns null unless the entity is PLAYER_VISIBLE canon
    // for this user's role (invariant #5). Pending/DM-only/secret never resolve.
    getEntityForUser(user.id, id, entityId),
  ]);

  if (!campaign || !entity) notFound();

  // listConnectionsForEntity re-applies the visibility projection per endpoint,
  // so a player only ever sees edges to other PLAYER_VISIBLE entities.
  const connections = await listConnectionsForEntity(user.id, id, entityId);
  const avatar = isAvatarImageType(entity.type);

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)]">
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-1)] px-6 py-[10px]">
        <Link
          href={`/play/campaigns/${id}`}
          className="inline-flex items-center gap-[5px] font-mono text-[10.5px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-colors hover:text-[var(--ink)]"
        >
          <ChevronLeft aria-hidden size={12} />
          Known World
        </Link>
        <span className="truncate font-mono text-[10.5px] uppercase text-[var(--ink-faint)]">
          / {formatEntityType(entity.type)} / {entity.name}
        </span>
      </div>

      <div className="max-w-[760px] px-6 py-6">
        {/* header */}
        <div className="mb-[10px] flex flex-wrap items-center gap-[10px]">
          <TypeDot type={entity.type} size={11} />
          <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-[var(--ink-faint)]">
            {formatEntityType(entity.type)}
          </span>
        </div>

        {entity.imageUrl && (
          <div className="mt-[14px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entity.imageUrl}
              alt={entity.name}
              className={cn(
                "border border-[var(--line)] bg-[var(--bg-2)] object-cover",
                avatar
                  ? "h-20 w-20 rounded-full"
                  : "max-h-[280px] w-full max-w-[440px] rounded-md",
              )}
            />
          </div>
        )}

        <h1 className="mt-[6px] font-display text-[30px] font-bold leading-[1.05] tracking-[.01em]">
          {entity.name}
        </h1>

        {entity.summary && (
          <p className="mt-[10px] text-[15px] leading-[1.4] text-[var(--ink-dim)]">
            {entity.summary}
          </p>
        )}

        {entity.description && (
          <div className="mt-[22px]">
            <Kicker dim noLead className="mb-[10px]">
              Description
            </Kicker>
            <Markdown content={entity.description} />
          </div>
        )}

        {entity.tags.length > 0 && (
          <div className="mt-[22px]">
            <Kicker dim noLead className="mb-[10px]">
              Tags
            </Kicker>
            <div className="flex flex-wrap gap-[5px]">
              {entity.tags.map((tag) => (
                <span
                  key={tag}
                  className="border border-[var(--line-strong)] px-[9px] py-1 font-mono text-[10px] tracking-[.04em] text-[var(--ink-dim)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {connections.length > 0 && (
          <div className="mt-[26px]">
            <Kicker dim noLead className="mb-[10px]">
              Connections
            </Kicker>
            <div className="flex flex-col gap-[6px]">
              {connections.map((connection) => (
                <Link
                  key={connection.id}
                  href={`/play/campaigns/${id}/entities/${connection.other.id}`}
                  className="panel flex items-center gap-[10px] px-[12px] py-[9px] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--bg-2)]"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
                    {relationshipEdgeLabel(connection.type, connection.direction)}
                  </span>
                  <ArrowRight
                    aria-hidden
                    size={12}
                    className="text-[var(--ink-faint)]"
                  />
                  <TypeDot type={connection.other.type} />
                  <span className="flex-1 truncate text-[13px] font-medium text-[var(--ink)]">
                    {connection.other.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
