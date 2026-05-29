/**
 * Dev-only helper: populate the seeded Demo Campaign with a small slice of the
 * Dungeon Crawler Carl world through the real service layer (so provenance is
 * recorded). Run with: npx tsx scripts/seed-world.ts
 */
import { prisma } from "@/server/db";
import {
  createCrawler,
  createGenericEntity,
} from "@/server/services/entities";
import { setEntityLock } from "@/server/services/review";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "dm@example.com" },
  });
  const campaign = await prisma.campaign.findFirstOrThrow({
    where: { ownerId: user.id, name: "Demo Campaign" },
  });

  // Clear any prior world so re-runs are idempotent.
  await prisma.entity.deleteMany({ where: { campaignId: campaign.id } });

  const carl = await createCrawler(user.id, campaign.id, {
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
  await setEntityLock(user.id, campaign.id, carl.id, {
    lockedFields: ["crawler.realName", "crawler.level"],
  });

  const donut = await createCrawler(user.id, campaign.id, {
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
  await setEntityLock(user.id, campaign.id, donut.id, { locked: true });

  const generics: Array<Parameters<typeof createGenericEntity>[2]> = [
    {
      type: "SYSTEM_AI",
      name: "The System",
      summary: "The in-fiction AI running the dungeon. Its persona drives every flavored generation.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["system"],
    },
    {
      type: "NPC",
      name: "Mordecai",
      summary: "Carl & Donut's guide and manager. Exiled, contracted, and not telling them everything.",
      description: "",
      visibility: "SHARED_WITH_PLAYERS",
      tags: ["guide"],
    },
    {
      type: "NPC",
      name: "The Maestro",
      summary: "A show host and production elite. Sadistic showman; manufactures spectacle.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["host"],
    },
    {
      type: "ORGANIZATION",
      name: "Borant Syndicate",
      summary: "The bankrupt corporation that seized Earth to run the show. Profit over spectacle.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["sponsor"],
    },
    {
      type: "FACTION",
      name: "The Grull Legion",
      summary: "Brutalist conscript army. Seized the eastern barbican; now presses the moat.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["floor 9", "war"],
    },
    {
      type: "FACTION",
      name: "Skull Empire",
      summary: "Proud, cornered war-clan losing ground at the keep.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["floor 9", "war"],
    },
    {
      type: "FLOOR",
      name: "Floor 9 — Faction Wars",
      summary: "A 30-day war over the castle of Larracos fought by nine armies.",
      description: "",
      visibility: "SHARED_WITH_PLAYERS",
      tags: ["floor 9"],
    },
    {
      type: "LOCATION",
      name: "Larracos",
      summary: "The contested castle at the heart of Floor 9. Whoever holds it, wins.",
      description: "",
      visibility: "SHARED_WITH_PLAYERS",
      tags: ["floor 9"],
    },
  ];

  for (const input of generics) {
    await createGenericEntity(user.id, campaign.id, input);
  }

  const count = await prisma.entity.count({ where: { campaignId: campaign.id } });
  console.log(`Seeded ${count} entities into "${campaign.name}".`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
