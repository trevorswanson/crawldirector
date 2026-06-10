import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

// Throwaway: populate the Demo Campaign with a rich, multi-floor timeline (mirrors
// the design mockup's sample canon) so the redesigned Crawl Timeline can be demoed.
// Writes rows directly — not through the review pipeline. Time bases are varied on
// purpose to exercise the new behaviours:
//   • COLLAPSE / ABSOLUTE_DAY events → inferred floor day-ranges (item 6)
//   • FLOOR_START *with* an offset    → anchored, NOT draggable (item 7)
//   • FLOOR_START w/o offset / UNSCHEDULED → draggable
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "dm@example.com" } });
  const campaign = await prisma.campaign.findFirstOrThrow({
    where: { ownerId: user.id, name: "Demo Campaign" },
  });

  // Idempotent re-run: clear prior demo timeline rows.
  await prisma.eventCausality.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.eventParticipant.deleteMany({ where: { event: { campaignId: campaign.id } } });
  await prisma.event.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaign.update({ where: { id: campaign.id }, data: { currentFloorId: null } });
  await prisma.crawler.deleteMany({ where: { entity: { campaignId: campaign.id } } });
  await prisma.entity.deleteMany({ where: { campaignId: campaign.id } });

  const ent = (type: string, name: string, extra: Record<string, unknown> = {}) =>
    prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: type as never,
        name,
        visibility: "PLAYER_VISIBLE",
        createdById: user.id,
        ...extra,
      },
      select: { id: true },
    });

  const carl = await ent("CRAWLER", "Carl");
  await prisma.crawler.create({ data: { id: carl.id, gold: 4000, level: 12, currentFloor: 9 } });
  const donut = await ent("CRAWLER", "Princess Donut");
  await prisma.crawler.create({ data: { id: donut.id, gold: 90000, level: 14, currentFloor: 9 } });

  const system = await ent("SYSTEM_AI", "The System", { source: "AI" });
  const grull = await ent("FACTION", "The Grull Legion", { source: "AI" });
  const skull = await ent("FACTION", "Skull Empire", { source: "AI" });
  const heg = await ent("NPC", "Warboss Heg", { source: "AI" });
  const mordecai = await ent("NPC", "Mordecai");
  const maestro = await ent("NPC", "The Maestro");
  const borant = await ent("ORGANIZATION", "Borant Syndicate", { source: "IMPORT" });
  const larracosLoc = await ent("LOCATION", "Larracos", { source: "AI" });

  // FLOOR entities carry data.floorNumber + data.theme (ADR 0005).
  await ent("FLOOR", "The Iron Choir", { data: { floorNumber: 7, theme: "Resonant halls · the walls sing back" } });
  await ent("FLOOR", "The Bone Market", { data: { floorNumber: 8, theme: "Black bazaar · everything has a price" } });
  const f9 = await ent("FLOOR", "Larracos", { data: { floorNumber: 9, theme: "Castle siege · the moat runs red" } });
  await ent("FLOOR", "The Iron Tangle", { data: { floorNumber: 10, theme: "Clockwork jungle · gears that grind the lost" } });

  type Time =
    | { basis: "FLOOR_START"; floor: number; offset?: number }
    | { basis: "COLLAPSE"; floor: number; offset: number }
    | { basis: "UNSCHEDULED"; floor: number; label: string };
  type P = { id: string; role: string };
  const ev = async (opts: {
    title: string;
    summary: string;
    time: Time;
    source?: string;
    secret?: boolean;
    locked?: boolean;
    rank: string;
    participants: P[];
    effects?: unknown[];
  }) => {
    const inGameTime: Record<string, unknown> = { ...opts.time };
    if ("offset" in opts.time && typeof opts.time.offset === "number") inGameTime.unit = "DAY";
    const event = await prisma.event.create({
      data: {
        campaignId: campaign.id,
        title: opts.title,
        summary: opts.summary,
        inGameTime: inGameTime as never,
        orderKey: opts.time.floor,
        rank: opts.rank,
        source: (opts.source ?? "DM") as never,
        secret: opts.secret ?? false,
        locked: opts.locked ?? false,
        effects: (opts.effects ?? []) as never,
        participants: { create: opts.participants.map((p) => ({ entityId: p.id, role: p.role as never })) },
      },
      select: { id: true },
    });
    return event.id;
  };

  // ── Floor 9 (current) — two absolute (COLLAPSE) events bound the day-range ──
  const e911 = await ev({
    title: "Siege timer enters its final 72 hours",
    summary: "The System opens the broadcast day by ratcheting the Floor-9 collapse clock. Safe-room access on the east wall is formally revoked.",
    time: { basis: "FLOOR_START", floor: 9, offset: 24 }, // anchored → not draggable
    source: "AI", rank: "a9",
    participants: [
      { id: system.id, role: "ACTOR" },
      { id: carl.id, role: "WITNESS" },
      { id: donut.id, role: "WITNESS" },
    ],
  });
  const e910 = await ev({
    title: "The Barbican Falls",
    summary: "The Grull Legion takes the eastern barbican after a night assault. Warboss Heg plants his standard on the breached wall as the audience picks sides.",
    time: { basis: "FLOOR_START", floor: 9, offset: 23 }, // anchored
    source: "AI", locked: true, rank: "a8",
    participants: [
      { id: grull.id, role: "ACTOR" },
      { id: skull.id, role: "AFFECTED" },
      { id: carl.id, role: "WITNESS" },
      { id: larracosLoc.id, role: "LOCATION" },
    ],
  });
  const e909 = await ev({
    title: "Donut's parapet taunt goes network-wide",
    summary: "Player ‘mattd' staged a monologue from the parapet mid-siege. The clip out-rated the war itself and a grateful sponsor wired a gift.",
    time: { basis: "COLLAPSE", floor: 9, offset: 412 }, // absolute → range, draggable
    source: "PLAYER_SUGGESTION", rank: "a7",
    participants: [
      { id: donut.id, role: "ACTOR" },
      { id: heg.id, role: "TARGET" },
    ],
    effects: [{ id: "fx-909", kind: "ADJUST_STAT", targetEntityId: donut.id, stat: "gold", delta: 12000, applied: false }],
  });
  const e908 = await ev({
    title: "Warboss Heg's gambit",
    summary: "Heg commits his reserves to a pre-dawn moat crossing — a costly bet generated by the Encounter engine under persona S-07.",
    time: { basis: "FLOOR_START", floor: 9, offset: 21 }, // anchored
    source: "AI", rank: "a6",
    participants: [
      { id: grull.id, role: "ACTOR" },
      { id: heg.id, role: "ACTOR" },
    ],
  });
  const e907 = await ev({
    title: "The System awakens — Persona S-07",
    summary: "Snapshot ‘Petty God, Newly Awake' goes live. The System begins bending its own rulebook for the bit. DM-only until you choose to surface it.",
    time: { basis: "COLLAPSE", floor: 9, offset: 388 }, // absolute → range lower bound
    source: "AI", secret: true, rank: "a5",
    participants: [
      { id: system.id, role: "ACTOR" },
      { id: borant.id, role: "AFFECTED" },
    ],
  });

  // ── Floor 8 — unscheduled / bare-floor events stay draggable ──
  const e803 = await ev({
    title: "Syndicate overturns the loot ruling",
    summary: "Imported from the shared DCC core: Borant's board reverses the System's Floor-8 reward ruling. The System takes it personally.",
    time: { basis: "UNSCHEDULED", floor: 8, label: "Late on Floor 8" }, // draggable
    source: "IMPORT", rank: "a3",
    participants: [
      { id: borant.id, role: "ACTOR" },
      { id: system.id, role: "AFFECTED" },
    ],
  });
  await ev({
    title: "Mordecai signs on as guide",
    summary: "You logged the contract: an exiled Daghan named Mordecai takes Carl & Donut as clients. Quietly the most consequential handshake of the season.",
    time: { basis: "FLOOR_START", floor: 8 }, // bare floor, no offset → draggable
    locked: true, rank: "a2",
    participants: [
      { id: mordecai.id, role: "ACTOR" },
      { id: carl.id, role: "AFFECTED" },
      { id: donut.id, role: "AFFECTED" },
    ],
  });
  await ev({
    title: "Carl loses his pants (again)",
    summary: "Logged for continuity. The audience has decided this is a recurring bit.",
    time: { basis: "UNSCHEDULED", floor: 8, label: "Sometime on Floor 8" }, // draggable
    rank: "a1",
    participants: [{ id: carl.id, role: "ACTOR" }],
  });

  // ── Floor 7 — one absolute event yields a single-day range ──
  await ev({
    title: "Princess Donut crosses 1M fame",
    summary: "The milestone that turned a murder-cat into a network draw. Marked canon and locked as a season landmark.",
    time: { basis: "COLLAPSE", floor: 7, offset: 277 }, // absolute → "Day 277"
    locked: true, rank: "a1",
    participants: [
      { id: donut.id, role: "ACTOR" },
      { id: maestro.id, role: "WITNESS" },
    ],
    effects: [{ id: "fx-702", kind: "ADJUST_STAT", targetEntityId: donut.id, stat: "level", delta: 2, applied: true, reviewStatus: "APPLIED" }],
  });
  const e701 = await ev({
    title: "Skull Empire crowns a rival warlord",
    summary: "Generated faction beat: the Skull Empire elevates a challenger to Heg, seeding the war that will define Floor 9.",
    time: { basis: "FLOOR_START", floor: 7, offset: 11 }, // anchored
    source: "AI", rank: "a0",
    participants: [
      { id: skull.id, role: "ACTOR" },
      { id: grull.id, role: "AFFECTED" },
    ],
  });

  // Causality threads (cause → effect)
  const link = (causeId: string, effectId: string) =>
    prisma.eventCausality.create({ data: { campaignId: campaign.id, causeId, effectId } });
  await link(e910, e911);
  await link(e908, e910);
  await link(e803, e907);
  await link(e701, e908);
  await link(e909, e911);

  await prisma.campaign.update({ where: { id: campaign.id }, data: { currentFloorId: f9.id } });

  console.log(`Seeded timeline for campaign ${campaign.id} — login dm@example.com / password123`);
  console.log(`Timeline: /campaigns/${campaign.id}/timeline`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
