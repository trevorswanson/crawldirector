import type { Prisma } from "@/generated/prisma/client";
import { CanonStatus, EntityType } from "@/generated/prisma/client";

import { effectiveFloorStartDay, readFloorData } from "@/lib/floor";
import { readTimeRef } from "@/lib/time-ref";
import type { FloorAnchors, ResolveContext } from "@/lib/time-resolve";

// The minimal client surface this needs — satisfied by both the PrismaClient and
// an interactive transaction client, so the same resolver runs at apply-time
// validation (services, on `prisma`) and approve-time materialization (review.ts,
// inside the apply `tx`). Keeping it single-sourced means the day a collapse
// "looks resolvable" at apply can't disagree with whether it resolves at approve.
type ResolveDb = Pick<Prisma.TransactionClient, "event" | "entity">;

// Build a `ResolveContext` (src/lib/time-resolve.ts) over the campaign so an
// event's in-fiction time can be placed on the absolute days-since-collapse axis
// (ADR 0008): EVENT-basis times walk to their anchor's day, and FLOOR_START /
// FLOOR_COLLAPSE times resolve against the floor's open/collapse anchors (with
// floor 1 defaulting to day 1 per ADR 0010).
export async function buildCampaignResolveContext(
  db: ResolveDb,
  campaignId: string,
): Promise<ResolveContext> {
  const events = await db.event.findMany({
    where: { campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, inGameTime: true },
  });
  const timeById = new Map<string, ReturnType<typeof readTimeRef>>();
  for (const event of events) timeById.set(event.id, readTimeRef(event.inGameTime));

  const floorRows = await db.entity.findMany({
    where: {
      campaignId,
      type: EntityType.FLOOR,
      status: { not: CanonStatus.ARCHIVED },
    },
    // FLOOR anchors live in the 1:1 satellite once migrated (ADR 0011 Part C).
    select: {
      data: true,
      floor: {
        select: {
          floorNumber: true,
          theme: true,
          startDay: true,
          collapseDay: true,
        },
      },
    },
  });
  const anchorsByFloor = new Map<number, FloorAnchors>();
  for (const row of floorRows) {
    const { floorNumber, startDay, collapseDay } = readFloorData(row.data, row.floor);
    if (floorNumber != null && !anchorsByFloor.has(floorNumber)) {
      anchorsByFloor.set(floorNumber, {
        startDay: effectiveFloorStartDay(floorNumber, startDay),
        collapseDay,
      });
    }
  }

  return {
    eventTimeById: (id) => timeById.get(id),
    floorAnchors: (floor) => anchorsByFloor.get(floor),
  };
}
