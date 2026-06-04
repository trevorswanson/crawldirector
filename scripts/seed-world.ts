/**
 * Dev-only helper: populate the seeded Demo Campaign with a slice of the Dungeon
 * Crawler Carl world through the real service layer (so provenance is recorded).
 * Run with: npx tsx scripts/seed-world.ts
 *
 * Seeds canon — entities, typed relationships (incl. a guild → party → member
 * hierarchy), events with participants + a cause→effect link, and an applied
 * effect — plus a handful of PENDING proposals so the Review Queue, Relationship
 * Graph, Timeline, and Connections/Roster panels all have real data to exercise.
 * Idempotent: clears the campaign's canon + proposals first.
 */
import { prisma } from "@/server/db";
import {
  createCrawler,
  createGenericEntity,
} from "@/server/services/entities";
import {
  createRelationship,
} from "@/server/services/relationships";
import {
  createEvent,
  updateEvent,
  applyEventEffects,
  linkEventCause,
} from "@/server/services/events";
import {
  setEntityLock,
  createPendingEventChangeSet,
  createPendingRelationshipChangeSet,
} from "@/server/services/review";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "dm@example.com" },
  });
  const campaign = await prisma.campaign.findFirstOrThrow({
    where: { ownerId: user.id, name: "Demo Campaign" },
  });
  const uid = user.id;
  const cid = campaign.id;

  // Clear any prior world so re-runs are idempotent. Order respects FKs; most
  // rows cascade from entity/event/changeSet deletion, but we clear explicitly
  // so events, causality, and proposals (which aren't entity-scoped) don't pile
  // up across runs.
  await prisma.auditLog.deleteMany({ where: { campaignId: cid } });
  await prisma.provenance.deleteMany({ where: { campaignId: cid } });
  await prisma.changeSet.deleteMany({ where: { campaignId: cid } });
  await prisma.eventCausality.deleteMany({ where: { campaignId: cid } });
  await prisma.event.deleteMany({ where: { campaignId: cid } });
  await prisma.relationship.deleteMany({ where: { campaignId: cid } });
  await prisma.entity.deleteMany({ where: { campaignId: cid } });

  // ── Crawlers ───────────────────────────────────────────────────────────────
  const carl = await createCrawler(uid, cid, {
    name: "Carl",
    realName: "Carl Tucker",
    crawlerNo: "4122",
    summary: "Former coast guard. Reluctant fan favorite. Still has no pants.",
    description:
      "Woke up in the collapse in a tank top and boxer shorts and never found anything better. Pragmatic, stubborn, and allergic to the spotlight he keeps walking into.",
    visibility: "PLAYER_FACING",
    tags: ["floor 9", "fan favorite"],
    level: 32,
    hp: 480,
    mp: 120,
    gold: 9001,
    viewCount: BigInt(2_400_000),
    followerCount: BigInt(980_000),
    favoriteCount: BigInt(120_000),
    killCount: 311,
    currentFloor: 9,
    isAlive: true,
  });
  // Lock his real name + level the way a DM protecting canon would.
  await setEntityLock(uid, cid, carl.id, {
    lockedFields: ["crawler.realName", "crawler.level"],
  });

  const donut = await createCrawler(uid, cid, {
    name: "Princess Donut",
    realName: "Donut",
    crawlerNo: "4123",
    summary: "Carl's cat. A Russian Blue with a crown, a vocabulary, and a body count.",
    description: "Show-stealing royalty who never asked for a sidekick.",
    visibility: "PLAYER_FACING",
    tags: ["floor 9", "royalty"],
    level: 31,
    gold: 4200,
    viewCount: BigInt(3_100_000),
    followerCount: BigInt(1_400_000),
    favoriteCount: BigInt(260_000),
    killCount: 198,
    currentFloor: 9,
    isAlive: true,
  });
  await setEntityLock(uid, cid, donut.id, { locked: true });

  // ── Supporting cast, factions, places, and groups ────────────────────────────
  const generics: Array<{
    key: string;
    input: Parameters<typeof createGenericEntity>[2];
  }> = [
    {
      key: "system",
      input: {
        type: "SYSTEM_AI",
        name: "The System",
        summary: "The in-fiction AI running the dungeon. Its persona drives every flavored generation.",
        visibility: "DM_ONLY",
        tags: ["system"],
      },
    },
    {
      key: "mordecai",
      input: {
        type: "NPC",
        name: "Mordecai",
        summary: "Carl & Donut's guide and manager. Exiled, contracted, and not telling them everything.",
        visibility: "SHARED_WITH_PLAYERS",
        tags: ["guide"],
      },
    },
    {
      key: "maestro",
      input: {
        type: "NPC",
        name: "The Maestro",
        summary: "A show host and production elite. Sadistic showman; manufactures spectacle.",
        visibility: "DM_ONLY",
        tags: ["host"],
      },
    },
    {
      key: "borant",
      input: {
        type: "ORGANIZATION",
        name: "Borant Syndicate",
        summary: "The bankrupt corporation that seized Earth to run the show. Profit over spectacle.",
        visibility: "DM_ONLY",
        tags: ["sponsor"],
      },
    },
    {
      key: "grull",
      input: {
        type: "FACTION",
        name: "The Grull Legion",
        summary: "Brutalist conscript army. Seized the eastern barbican; now presses the moat.",
        visibility: "DM_ONLY",
        tags: ["floor 9", "war"],
      },
    },
    {
      key: "skull",
      input: {
        type: "FACTION",
        name: "Skull Empire",
        summary: "Proud, cornered war-clan losing ground at the keep.",
        visibility: "DM_ONLY",
        tags: ["floor 9", "war"],
      },
    },
    {
      key: "floor9",
      input: {
        type: "FLOOR",
        name: "Floor 9 — Faction Wars",
        summary: "A 30-day war over the castle of Larracos fought by nine armies.",
        visibility: "SHARED_WITH_PLAYERS",
        tags: ["floor 9"],
      },
    },
    {
      key: "larracos",
      input: {
        type: "LOCATION",
        name: "Larracos",
        summary: "The contested castle at the heart of Floor 9. Whoever holds it, wins.",
        visibility: "SHARED_WITH_PLAYERS",
        tags: ["floor 9"],
      },
    },
    {
      key: "court",
      input: {
        type: "PARTY",
        name: "Team Princess Donut",
        summary: "Carl & Donut's two-member party of record. Donut chairs; Carl objects.",
        visibility: "PLAYER_FACING",
        tags: ["floor 9"],
      },
    },
    {
      key: "coalition",
      input: {
        type: "GUILD",
        name: "The Borant Loyalists' Coalition",
        summary: "A loose guild of Floor 9 parties nominally aligned with the production.",
        visibility: "SHARED_WITH_PLAYERS",
        tags: ["floor 9"],
      },
    },
  ];

  const byKey = new Map<string, string>([
    ["carl", carl.id],
    ["donut", donut.id],
  ]);
  for (const { key, input } of generics) {
    const created = await createGenericEntity(uid, cid, input);
    byKey.set(key, created.id);
  }
  const id = (key: string) => {
    const value = byKey.get(key);
    if (!value) throw new Error(`Missing seeded entity: ${key}`);
    return value;
  };

  // ── Relationships (typed, any-to-any) ────────────────────────────────────────
  // Membership hierarchy: members → party → guild (rolls up in the Roster panel).
  const edges: Array<{
    source: string;
    type: Parameters<typeof createRelationship>[3]["type"];
    target: string;
    disposition?: number;
    notes?: string;
    secret?: boolean;
  }> = [
    { source: "carl", type: "ALLY_OF", target: "donut", disposition: 80, notes: "Bonded under fire." },
    { source: "donut", type: "LEADS", target: "court" },
    { source: "carl", type: "MEMBER_OF", target: "court" },
    { source: "donut", type: "MEMBER_OF", target: "court" },
    { source: "court", type: "MEMBER_OF", target: "coalition" },
    { source: "mordecai", type: "MENTOR_OF", target: "carl", disposition: 40 },
    { source: "grull", type: "AT_WAR_WITH", target: "skull", disposition: -90, notes: "Siege of Larracos." },
    { source: "carl", type: "LOCATED_ON", target: "floor9" },
    { source: "donut", type: "LOCATED_ON", target: "floor9" },
    { source: "larracos", type: "PART_OF", target: "floor9" },
    { source: "maestro", type: "MANIPULATES", target: "borant", disposition: -30, notes: "Plays the suits for ratings.", secret: true },
  ];
  for (const edge of edges) {
    await createRelationship(uid, cid, id(edge.source), {
      type: edge.type,
      targetId: id(edge.target),
      disposition: edge.disposition,
      notes: edge.notes,
      secret: edge.secret ?? false,
    });
  }

  // ── Canon events + a cause→effect link ───────────────────────────────────────
  const reach = await createEvent(uid, cid, {
    title: "Carl & Donut breach Floor 9",
    summary: "The pair drop into the Faction Wars and pick a side by accident.",
    floor: 9,
    secret: false,
    participants: [
      { entityId: id("carl"), role: "ACTOR" },
      { entityId: id("donut"), role: "ACTOR" },
      { entityId: id("floor9"), role: "LOCATION" },
    ],
  });

  const siege = await createEvent(uid, cid, {
    title: "The siege of Larracos begins",
    summary: "The Grull Legion presses the moat; the Skull Empire digs in at the keep.",
    floor: 9,
    secret: false,
    participants: [
      { entityId: id("grull"), role: "ACTOR" },
      { entityId: id("skull"), role: "TARGET" },
      { entityId: id("larracos"), role: "LOCATION" },
    ],
  });

  // Breaching the floor set the siege in motion.
  await linkEventCause(uid, cid, {
    causeId: reach.id,
    effectId: siege.id,
    note: "Their arrival tipped the stalemate.",
  });

  // An event whose effects are already applied to canon (shows on the timeline as
  // applied, and bumps Carl's gold/kills through the lock-aware pipeline).
  const warlord = await createEvent(uid, cid, {
    title: "Carl downs the Grull warlord",
    summary: "A brutal duel at the barbican. Loot and notoriety follow.",
    floor: 9,
    secret: false,
    participants: [
      { entityId: id("carl"), role: "ACTOR" },
      { entityId: id("grull"), role: "TARGET" },
    ],
  });
  await updateEvent(
    uid,
    cid,
    warlord.id,
    {
      title: "Carl downs the Grull warlord",
      summary: "A brutal duel at the barbican. Loot and notoriety follow.",
      floor: 9,
      secret: false,
      participants: [
        { entityId: id("carl"), role: "ACTOR" },
        { entityId: id("grull"), role: "TARGET" },
      ],
      effects: [
        { kind: "ADJUST_STAT", targetEntityId: id("carl"), stat: "gold", delta: 2500, note: "Warlord's hoard" },
        { kind: "ADJUST_STAT", targetEntityId: id("carl"), stat: "killCount", delta: 1, note: "+1 boss kill" },
      ],
    },
    // Auto-approve + apply these effects so the timeline shows applied history.
    { applyEffects: true },
  );

  // ── PENDING proposals for the Review Queue ──────────────────────────────────
  // (1) An effect-apply proposal — exercises the new structured effect-row editor.
  const wounded = await createEvent(uid, cid, {
    title: "Donut's collar overloads",
    summary: "A risky cast leaves Carl drained and Donut's gear smoking.",
    floor: 9,
    secret: false,
    participants: [{ entityId: id("carl"), role: "ACTOR" }],
  });
  await updateEvent(uid, cid, wounded.id, {
    title: "Donut's collar overloads",
    summary: "A risky cast leaves Carl drained and Donut's gear smoking.",
    floor: 9,
    secret: false,
    participants: [{ entityId: id("carl"), role: "ACTOR" }],
    effects: [
      { kind: "ADJUST_STAT", targetEntityId: id("carl"), stat: "hp", delta: -120, note: "Backlash" },
      { kind: "SET_STAT", targetEntityId: id("carl"), stat: "mp", valueNumber: 0, note: "Tapped out" },
    ],
  });
  await applyEventEffects(uid, cid, wounded.id);

  // (2) An AI-proposed new event (lands as a "Log event" proposal).
  await createPendingEventChangeSet(uid, cid, {
    source: "AI",
    title: "Borant throttles Carl's air supply",
    summary: "Persona-flavored consequence the AI proposes for review.",
    operations: [
      {
        op: "CREATE_EVENT",
        patch: {
          title: { to: "Borant throttles Carl's air supply" },
          summary: { to: "Production cuts oxygen to the barbican to juice the broadcast." },
          inGameTime: { to: { floor: 9 } },
          orderKey: { to: 9 },
          secret: { to: false },
          participants: {
            to: [
              { entityId: id("carl"), role: "AFFECTED" },
              { entityId: id("borant"), role: "ACTOR" },
            ],
          },
        },
      },
    ],
  });

  // (3) A player-suggested event.
  await createPendingEventChangeSet(uid, cid, {
    source: "PLAYER_SUGGESTION",
    title: "Donut demands a sponsor meeting",
    summary: "Submitted by a player for the DM to canonize.",
    operations: [
      {
        op: "CREATE_EVENT",
        patch: {
          title: { to: "Donut demands a sponsor meeting" },
          summary: { to: "Princess Donut leverages her follower count for a parlay." },
          inGameTime: { to: { floor: 9 } },
          orderKey: { to: 9 },
          secret: { to: false },
          participants: {
            to: [
              { entityId: id("donut"), role: "ACTOR" },
              { entityId: id("maestro"), role: "TARGET" },
            ],
          },
        },
      },
    ],
  });

  // (4) An AI-inferred relationship proposal (queue shows "Source → Target").
  await createPendingRelationshipChangeSet(uid, cid, {
    source: "AI",
    title: "Inferred: The Maestro is used by Borant",
    summary: "Relationship inference awaiting DM review.",
    operations: [
      {
        op: "CREATE_RELATIONSHIP",
        patch: {
          type: { to: "USED_BY" },
          sourceId: { to: id("maestro") },
          targetId: { to: id("borant") },
          disposition: { to: -20 },
          notes: { to: "The suits think they run him." },
          secret: { to: false },
        },
      },
    ],
  });

  const [entities, relationships, events, pending] = await Promise.all([
    prisma.entity.count({ where: { campaignId: cid } }),
    prisma.relationship.count({ where: { campaignId: cid, status: "CANON" } }),
    prisma.event.count({ where: { campaignId: cid, status: "CANON" } }),
    prisma.changeSet.count({ where: { campaignId: cid, status: "PENDING" } }),
  ]);
  console.log(
    `Seeded "${campaign.name}": ${entities} entities, ${relationships} edges, ` +
      `${events} events, ${pending} pending proposals for review.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
