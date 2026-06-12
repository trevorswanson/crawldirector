import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { Client } from "pg";

/**
 * Signs up a new user and creates a campaign.
 * Returns the email used and the campaign id parsed from the URL.
 */
export async function signUpAndCreateCampaign(
  page: Page,
  opts: { name?: string; campaignName?: string } = {},
): Promise<{ email: string; campaignId: string }> {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `e2e-${suffix}@example.com`;
  const campaignName = opts.campaignName ?? `Campaign ${suffix}`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(opts.name ?? "E2E DM");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password12345");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL(/\/dashboard/);

  await page.getByLabel("Crawl name").fill(campaignName);
  await page.getByRole("button", { name: "Create crawl" }).click();

  await page.waitForURL(/\/campaigns\//);

  const match = page.url().match(/\/campaigns\/([^/?#]+)/);
  if (!match) throw new Error("Could not parse campaign id from URL: " + page.url());
  const campaignId = match[1];

  return { email, campaignId };
}

/**
 * Signs in as an existing user via /sign-in.
 */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
}

/**
 * Inserts a PLAYER membership for an existing user into the database directly.
 * Uses DATABASE_URL from the environment (loaded via dotenv/config).
 */
export async function addPlayerMembership(
  email: string,
  campaignId: string,
): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const userRes = await client.query<{ id: string }>(
      `SELECT id FROM "User" WHERE email = $1 LIMIT 1`,
      [email],
    );
    if (userRes.rows.length === 0) {
      throw new Error(`User not found: ${email}`);
    }
    const userId = userRes.rows[0].id;

    // Use a random cuid-shaped id derived from a UUID
    const id = `c${randomUUID().replace(/-/g, "")}`;

    await client.query(
      `INSERT INTO "Membership" (id, "userId", "campaignId", role, "createdAt")
       VALUES ($1, $2, $3, 'PLAYER', now())
       ON CONFLICT ("userId", "campaignId") DO NOTHING`,
      [id, userId, campaignId],
    );
  } finally {
    await client.end();
  }
}
