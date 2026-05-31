/**
 * Dev-only helper: populate a campaign with the entire official lore from the JSONL dataset
 * through the review pipeline (so provenance is recorded).
 * Run with: npx tsx scripts/seed-lore.ts [campaignName] [--limit N]
 */
import { prisma } from "@/server/db";
import { seedCampaignFromLore } from "@/server/services/seeding";

async function main() {
  const args = process.argv.slice(2);
  let campaignName = "Demo Campaign";
  let limit: number | undefined = undefined;

  // Simple arg parsing
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (!args[i].startsWith("-")) {
      campaignName = args[i];
    }
  }

  console.log(`Locating user 'dm@example.com'...`);
  const user = await prisma.user.findUnique({
    where: { email: "dm@example.com" },
  });

  if (!user) {
    console.error("Error: User 'dm@example.com' not found. Please run 'npm run db:seed' first.");
    process.exit(1);
  }

  console.log(`Locating campaign '${campaignName}' for owner '${user.name || user.email}'...`);
  const campaign = await prisma.campaign.findFirst({
    where: { ownerId: user.id, name: campaignName },
  });

  if (!campaign) {
    console.error(`Error: Campaign '${campaignName}' not found.`);
    process.exit(1);
  }

  console.log(`Starting seeding of campaign '${campaign.name}' with clearExisting: true...`);
  const startTime = Date.now();
  const result = await seedCampaignFromLore(user.id, campaign.id, {
    limit,
    clearExisting: true,
  });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`Success! Seeded ${result.count} lore entities into '${campaign.name}' in ${duration}s.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Seeding failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
