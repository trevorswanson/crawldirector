import fs from "fs";
import path from "path";
import {
  EntityType,
  OpKind,
  Visibility,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import {
  applyAutoApprovedEntityChangeSet,
  type ReviewPatch,
} from "@/server/services/review";

export interface SeedingOptions {
  limit?: number;
  clearExisting?: boolean;
}

/**
 * Classifies an entity based on its title and body text.
 */
export function classifyEntity(title: string, bodyText: string): EntityType {
  const titleLower = title.toLowerCase();
  const textLower = bodyText.toLowerCase();
  const firstLines = bodyText.split("\n").slice(0, 3).join(" ").toLowerCase();

  // High-confidence title endings or matches
  if (title.endsWith(" Achievement") || titleLower.includes("achievement")) return EntityType.ACHIEVEMENT;
  if (title.endsWith(" Skill") || titleLower.includes("skill")) return EntityType.SKILL;
  if (title.endsWith(" Spell") || titleLower.includes("spell")) return EntityType.SPELL;
  if (title.endsWith(" Floor") || titleLower.includes("floor")) return EntityType.FLOOR;
  if (title.endsWith(" Class") || titleLower.includes("class")) return EntityType.CLASS;
  if (title.endsWith(" Potion") || title.startsWith("Scroll of ") || title.endsWith(" Box") || title.endsWith(" Ring") || title.endsWith(" Wand")) return EntityType.ITEM;
  if (title.endsWith(" Deity") || title.endsWith(" God") || ["shango", "emberus", "ogun", "legba", "oshun", "asojano", "inle", "yemaya"].includes(titleLower)) return EntityType.DEITY;
  if (["carl", "donut", "katia grim", "bautista", "prepotente", "lucia", "hekla"].includes(titleLower)) return EntityType.CRAWLER;
  if (["the system", "system ai"].includes(titleLower)) return EntityType.SYSTEM_AI;
  if (["mordecai", "odette", "zev", "mexx-55", "damien"].includes(titleLower)) return EntityType.NPC;
  if (title.endsWith(" Inc") || title.endsWith(" Corporation") || title.endsWith(" Co.") || title.endsWith(" Syndicate") || titleLower.includes("corporation") || titleLower.includes("syndicate")) return EntityType.ORGANIZATION;
  if (title.endsWith(" Show") || title.endsWith(" TV") || titleLower.includes("talk-show") || titleLower.includes("broadcast")) return EntityType.SHOW;
  if (title.endsWith(" Boss") || titleLower.includes("boss")) return EntityType.BOSS;

  // Body text keyword matches (typically in first few sentences)
  if (firstLines.includes("is an achievement") || firstLines.includes("achievement awarded")) return EntityType.ACHIEVEMENT;
  if (firstLines.includes("is a spell") || firstLines.includes("necromancy spell") || firstLines.includes("spell that") || textLower.includes("spell level")) return EntityType.SPELL;
  if (firstLines.includes("is a skill") || firstLines.includes("passive ability") || firstLines.includes("active ability") || textLower.includes("gains this skill") || textLower.includes("skill given to") || textLower.includes("skill allows")) return EntityType.SKILL;
  if (firstLines.includes("is a debuff") || firstLines.includes("is a buff") || textLower.includes("debuff") || textLower.includes("status effect") || textLower.includes("buff that") || textLower.includes("healing buff")) return EntityType.SKILL;
  if (firstLines.includes("is a crawler") || firstLines.includes("former crawler") || firstLines.includes("crawlers from earth") || firstLines.includes("crawler from earth") || textLower.includes("crawler princess donut")) return EntityType.CRAWLER;
  if (firstLines.includes("is an npc") || firstLines.includes("npc employed") || firstLines.includes("level 50 non-combatant") || firstLines.includes("is a former crawler and a")) return EntityType.NPC;
  if (firstLines.includes("is a boss") || firstLines.includes("city boss") || firstLines.includes("borough boss") || firstLines.includes("neighborhood boss")) return EntityType.BOSS;
  if (firstLines.includes("is a mob") || firstLines.includes("are a mob") || firstLines.includes("mobs found") || firstLines.includes("mobs that") || firstLines.includes("creature") || firstLines.includes("monster") || firstLines.includes("beast")) return EntityType.MOB_TYPE;
  if (firstLines.includes("is a species") || firstLines.includes("is a race") || firstLines.includes("are a species") || firstLines.includes("are a race")) return EntityType.SPECIES;
  if (firstLines.includes("is a class") || firstLines.includes("class offered")) return EntityType.CLASS;
  if (firstLines.includes("is a floor") || firstLines.includes("floor of the dungeon")) return EntityType.FLOOR;
  if (firstLines.includes("is a god") || firstLines.includes("is a deity") || firstLines.includes("demi-god")) return EntityType.DEITY;
  if (firstLines.includes("is a location") || firstLines.includes("is a market") || firstLines.includes("safe room") || firstLines.includes("is a room") || firstLines.includes("is a house") || firstLines.includes("is a castle") || firstLines.includes("is a building") || firstLines.includes("is a settlement") || firstLines.includes("is a city")) return EntityType.LOCATION;
  if (firstLines.includes("is a guild")) return EntityType.GUILD;
  if (firstLines.includes("is a party")) return EntityType.PARTY;
  if (firstLines.includes("is a faction")) return EntityType.FACTION;
  if (firstLines.includes("is a corporation") || firstLines.includes("is a company") || firstLines.includes("syndicate")) return EntityType.ORGANIZATION;
  if (firstLines.includes("is a sponsor")) return EntityType.SPONSOR;
  if (firstLines.includes("is a show") || firstLines.includes("talk-show") || firstLines.includes("broadcast")) return EntityType.SHOW;
  if (firstLines.includes("is a card") || firstLines.includes("is a potion") || firstLines.includes("is a scroll") || firstLines.includes("is an item") || firstLines.includes("is a weapon") || firstLines.includes("is a shield") || firstLines.includes("is a ring") || firstLines.includes("is a box") || firstLines.includes("is a wand") || firstLines.includes("is a brick") || firstLines.includes("is a case") || firstLines.includes("toothpaste")) return EntityType.ITEM;

  // Title keyword matching fallback
  if (/\bsponsor\b/i.test(title)) return EntityType.SPONSOR;
  if (/\bfaction\b/i.test(title)) return EntityType.FACTION;
  if (/\bguild\b/i.test(title)) return EntityType.GUILD;
  if (/\bparty\b/i.test(title)) return EntityType.PARTY;
  if (/\bcompany\b/i.test(title)) return EntityType.ORGANIZATION;
  if (/\btitle\b/i.test(title)) return EntityType.TITLE;
  if (/\bsystem message\b/i.test(title)) return EntityType.SYSTEM_MESSAGE;
  if (/\bspecies\b/i.test(title) || /\brace\b/i.test(title)) return EntityType.SPECIES;
  if (/\bneighborhood\b/i.test(title) || /\btown\b/i.test(title) || /\bvillage\b/i.test(title)) return EntityType.NEIGHBORHOOD;
  if (/\blocation\b/i.test(title) || /\bcastle\b/i.test(title) || /\bhouse\b/i.test(title) || /\broom\b/i.test(title) || /\bpalace\b/i.test(title) || /\btemple\b/i.test(title) || /\bbridge\b/i.test(title) || /\bclub\b/i.test(title)) return EntityType.LOCATION;
  if (titleLower.includes("potion") || titleLower.includes("scroll") || titleLower.includes("toothpaste") || titleLower.includes("box") || titleLower.includes("wand") || titleLower.includes("ring") || titleLower.includes("crown") || titleLower.includes("armor") || titleLower.includes("weapon") || titleLower.includes("shield") || titleLower.includes("hat") || titleLower.includes("boot") || titleLower.includes("cloak") || titleLower.includes("glove") || titleLower.includes("amulet") || titleLower.includes("key") || titleLower.includes("card") || titleLower.includes("book") || titleLower.includes("bracers") || titleLower.includes("blade") || titleLower.includes("sword") || titleLower.includes("bow") || titleLower.includes("case") || titleLower.includes("bricks") || titleLower.includes("toothpaste") || titleLower.includes("bomb") || titleLower.includes("music") || titleLower.includes("tome") || titleLower.includes("manual")) return EntityType.ITEM;

  // Broader body-text catchalls
  if (textLower.includes("quest") || textLower.includes("achievement")) return EntityType.ACHIEVEMENT;
  if (textLower.includes("weapon") || textLower.includes("shield") || textLower.includes("armor") || textLower.includes("wand")) return EntityType.ITEM;
  if (textLower.includes("spell") || textLower.includes("cast")) return EntityType.SPELL;
  if (textLower.includes("skill") || textLower.includes("ability")) return EntityType.SKILL;
  if (textLower.includes("boss")) return EntityType.BOSS;
  if (textLower.includes("mob") || textLower.includes("creature")) return EntityType.MOB_TYPE;
  if (textLower.includes("floor")) return EntityType.FLOOR;
  if (textLower.includes("deity") || textLower.includes("god")) return EntityType.DEITY;

  // Default: proper nouns to NPC, otherwise to ITEM
  if (title.trim().split(/\s+/).length === 1 && title[0] === title[0].toUpperCase()) {
    return EntityType.NPC;
  }
  return EntityType.ITEM;
}

/**
 * Clean the markdown text to extract a brief summary and a description.
 */
export function extractSummaryAndDescription(
  title: string,
  text: string
): { summary: string; description: string } {
  // Strip the title line (e.g. #Title) if it exists
  const lines = text.split("\n");
  if (lines[0]?.trim().startsWith(`#${title}`) || lines[0]?.trim() === `#${title.replace(/\s+/g, "")}`) {
    lines.shift();
  }

  const cleanText = lines.join("\n").trim();
  
  // Find first paragraph for the summary
  const paragraphs = cleanText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  let summary = paragraphs[0] || "";
  
  // Clean basic HTML entities in summary
  summary = summary.replace(/&lt;br&gt;/gi, "\n").replace(/&lt;.*?&gt;/gi, "");
  
  // Enforce validation constraints
  if (summary.length > 500) {
    summary = summary.substring(0, 497) + "...";
  }

  let description = cleanText.replace(/&lt;br&gt;/gi, "\n");
  if (description.length > 10000) {
    description = description.substring(0, 9997) + "...";
  }

  return { summary, description };
}

/**
 * Seed a campaign with lore extracted from dungeon-crawler-carl.jsonl
 */
export async function seedCampaignFromLore(
  userId: string,
  campaignId: string,
  options?: SeedingOptions
): Promise<{ count: number }> {
  // Check authorization (must be OWNER or CO_DM)
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });
  if (!membership || membership.role === "PLAYER") {
    throw new Error("You do not have permission to seed this campaign.");
  }

  // Check if JSONL file exists
  const filePath = path.join(process.cwd(), "dungeon-crawler-carl.jsonl");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Lore seed file not found at ${filePath}`);
  }

  if (options?.clearExisting) {
    // Cascade-delete entities, relationships, events, and change history inside this campaign
    await prisma.eventCausality.deleteMany({ where: { campaignId } });
    await prisma.eventParticipant.deleteMany({ where: { event: { campaignId } } });
    await prisma.event.deleteMany({ where: { campaignId } });
    await prisma.relationship.deleteMany({ where: { campaignId } });
    await prisma.crawler.deleteMany({ where: { entity: { campaignId } } });
    await prisma.entity.deleteMany({ where: { campaignId } });
    await prisma.provenance.deleteMany({ where: { campaignId } });
    await prisma.changeOperation.deleteMany({ where: { changeSet: { campaignId } } });
    await prisma.changeSet.deleteMany({ where: { campaignId } });
    await prisma.auditLog.deleteMany({ where: { campaignId } });
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split("\n").filter((l) => l.trim().length > 0);
  
  // Total to parse
  const totalRecords = options?.limit ? Math.min(options.limit, lines.length) : lines.length;
  
  let seededCount = 0;
  const batchSize = 100;
  let currentOperations: Array<{ op: "CREATE_ENTITY"; patch: ReviewPatch }> = [];

  const runBatch = async (ops: typeof currentOperations, batchIdx: number) => {
    await applyAutoApprovedEntityChangeSet(userId, campaignId, {
      title: `Import Lore Batch ${batchIdx}`,
      summary: `Importing ${ops.length} official entities from lore dataset.`,
      operations: ops,
    });
  };

  let batchCount = 1;
  for (let i = 0; i < totalRecords; i++) {
    let lineObj: { text: string; meta: string };
    try {
      lineObj = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    const titleMatch = lineObj.text.match(/^#([^\n]+)/);
    if (!titleMatch) continue;
    const name = titleMatch[1].trim();
    
    // Classify and clean
    const type = classifyEntity(name, lineObj.text);
    const { summary, description } = extractSummaryAndDescription(name, lineObj.text);

    // Visibility defaults
    const visibility = type === EntityType.CRAWLER ? Visibility.PLAYER_FACING : Visibility.SHARED_WITH_PLAYERS;

    // Build the patch
    const patch: ReviewPatch = {
      type: { to: type },
      name: { to: name },
      summary: { to: summary || null },
      description: { to: description || null },
      visibility: { to: visibility },
      tags: { to: ["lore", type.toLowerCase()] },
    };

    // Add specialized crawler fields if type is CRAWLER
    if (type === EntityType.CRAWLER) {
      const firstLines = lineObj.text.split("\n").slice(0, 3).join(" ").toLowerCase();
      // Define iconic character stats if encountered, otherwise sensible defaults
      let level = 1;
      let realName = name;
      let crawlerNo: string | null = null;
      let gold = 0;
      let viewCount = BigInt(0);
      let followerCount = BigInt(0);
      let favoriteCount = BigInt(0);
      let killCount = 0;
      let hp = 100;
      let mp = 50;
      let currentFloor = 1;

      const nameLower = name.toLowerCase();
      if (nameLower === "carl") {
        realName = "Carl Tucker";
        crawlerNo = "4122";
        level = 32;
        hp = 480;
        mp = 120;
        gold = 9001;
        viewCount = BigInt(2400000);
        followerCount = BigInt(980000);
        favoriteCount = BigInt(120000);
        killCount = 311;
        currentFloor = 9;
      } else if (nameLower === "donut" || nameLower === "princess donut") {
        realName = "Princess Donut";
        crawlerNo = "4123";
        level = 31;
        hp = 250;
        mp = 400;
        gold = 4200;
        viewCount = BigInt(3100000);
        followerCount = BigInt(1400000);
        favoriteCount = BigInt(260000);
        killCount = 198;
        currentFloor = 9;
      } else if (nameLower === "katia grim") {
        realName = "Katia Grim";
        crawlerNo = "4125";
        level = 28;
        hp = 290;
        mp = 180;
        gold = 1500;
        viewCount = BigInt(450000);
        followerCount = BigInt(120000);
        favoriteCount = BigInt(30000);
        killCount = 87;
        currentFloor = 9;
      } else {
        // Try parsing Level from firstLines
        const lvlMatch = firstLines.match(/level\s+(\d+)/);
        if (lvlMatch) {
          level = parseInt(lvlMatch[1], 10);
        }
      }

      Object.assign(patch, {
        "crawler.realName": { to: realName },
        "crawler.crawlerNo": { to: crawlerNo },
        "crawler.level": { to: level },
        "crawler.hp": { to: hp },
        "crawler.mp": { to: mp },
        "crawler.gold": { to: gold },
        "crawler.viewCount": { to: viewCount.toString() },
        "crawler.followerCount": { to: followerCount.toString() },
        "crawler.favoriteCount": { to: favoriteCount.toString() },
        "crawler.killCount": { to: killCount },
        "crawler.isAlive": { to: true },
        "crawler.currentFloor": { to: currentFloor },
      });
    }

    currentOperations.push({
      op: OpKind.CREATE_ENTITY,
      patch,
    });
    seededCount++;

    if (currentOperations.length >= batchSize) {
      await runBatch(currentOperations, batchCount++);
      currentOperations = [];
    }
  }

  // Run final batch if any operations remain
  if (currentOperations.length > 0) {
    await runBatch(currentOperations, batchCount);
  }

  return { count: seededCount };
}
