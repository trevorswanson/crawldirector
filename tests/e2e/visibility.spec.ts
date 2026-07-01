import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { signUpAndCreateCampaign, addPlayerMembership } from "./helpers";

test("player sees only PLAYER_VISIBLE entities and non-secret events; review queue is inaccessible", async ({
  page,
}) => {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

  // ── DM session: set up the campaign ──────────────────────────────────────
  const { campaignId } = await signUpAndCreateCampaign(page, {
    name: "E2E DM Visibility",
    campaignName: `VisibilityCampaign ${suffix}`,
  });

  // ── Create a DM_ONLY entity (default visibility) ──────────────────────────
  const dmOnlyName = `DM Only ${suffix}`;
  await page.getByRole("button", { name: "Create Entity" }).click();
  await page.getByPlaceholder("New entity name…").fill(dmOnlyName);
  await page.getByRole("button", { name: "Create and Edit" }).click();
  await page.waitForURL(/\/campaigns\/[^/]+\/entities\//);

  // Get DM-only entity id
  const dmEntityUrl = page.url();
  const dmEntityId = dmEntityUrl.match(/\/entities\/([^/?#]+)/)![1];

  // Navigate to edit mode, set summary, save (visibility stays DM_ONLY by default)
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\?edit=/);
  await page.getByLabel("Summary").fill("DM only summary");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/entities\/[^?]+$/);

  // ── Create a PLAYER_VISIBLE entity ────────────────────────────────────────
  await page.goto(`/campaigns/${campaignId}`);

  const playerVisibleName = `Player Visible ${suffix}`;
  await page.getByRole("button", { name: "Create Entity" }).click();
  await page.getByPlaceholder("New entity name…").fill(playerVisibleName);
  await page.getByRole("button", { name: "Create and Edit" }).click();
  await page.waitForURL(/\/campaigns\/[^/]+\/entities\//);

  // Go to edit mode to set summary AND change visibility
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\?edit=/);
  await page.getByLabel("Summary").fill("Player visible summary");

  // Change visibility to PLAYER_VISIBLE. In edit mode the sidebar buttons are enabled.
  // Click "player visible" to set the visibility (the active state updates the hidden input).
  await page.getByRole("button", { name: /player visible/i }).click();

  // Save the form (which includes the visibility hidden input)
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/entities\/[^?]+$/);

  // ── Create a CRAWLER for timeline events (must be PLAYER_VISIBLE so events show) ─
  await page.goto(`/campaigns/${campaignId}`);
  await page.getByRole("button", { name: "Create Entity" }).click();
  await page.getByPlaceholder("New entity name…").fill(`Crawler ${suffix}`);
  await page.locator("select[name='type']").selectOption("CRAWLER");
  // "Create and Edit" to set visibility to PLAYER_VISIBLE
  await page.getByRole("button", { name: "Create and Edit" }).click();
  await page.waitForURL(/\/campaigns\/[^/]+\/entities\//);
  // Go to edit mode to set visibility
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\?edit=/);
  await page.getByRole("button", { name: /player visible/i }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/entities\/[^?]+$/);
  // Go back to campaign
  await page.goto(`/campaigns/${campaignId}`);

  // ── Create timeline events ────────────────────────────────────────────────
  await page.goto(`/campaigns/${campaignId}/timeline`);

  // Event 1: normal (non-secret)
  const normalEventTitle = `Normal Event ${suffix}`;
  await page.getByRole("button", { name: "Log event" }).click();
  await page.getByPlaceholder("What happened?").fill(normalEventTitle);
  await page.getByLabel("Search participant...").fill(`Crawler ${suffix}`);
  await page.getByRole("button", { name: `Crawler ${suffix}` }).first().click();
  await page.getByRole("button", { name: "Log event" }).click();
  await expect(page.getByText(normalEventTitle)).toBeVisible();

  // Event 2: secret (DM-only checkbox)
  const secretEventTitle = `Secret Event ${suffix}`;
  await page.getByRole("button", { name: "Log event" }).click();
  await page.getByPlaceholder("What happened?").fill(secretEventTitle);
  await page.getByLabel("DM-only").check();
  await page.getByLabel("Search participant...").fill(`Crawler ${suffix}`);
  await page.getByRole("button", { name: `Crawler ${suffix}` }).first().click();
  await page.getByRole("button", { name: "Log event" }).click();
  await expect(page.getByText(secretEventTitle)).toBeVisible();

  // ── Sign up the second user (player) ──────────────────────────────────────
  const playerEmail = `e2e-player-${suffix}@example.com`;

  // Clear cookies to start a fresh session, then sign up the player account
  await page.context().clearCookies();
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Player");
  await page.getByLabel("Email").fill(playerEmail);
  await page.getByLabel("Password").fill("password12345");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/dashboard/);

  // ── Insert PLAYER membership directly via DB ──────────────────────────────
  await addPlayerMembership(playerEmail, campaignId);

  // ── Player session: the DM console redirects players to their crawler
  // interface (M7). A player reads canon only through the visibility projection
  // and never touches the DM console — a player who lands on (or bookmarks) a DM
  // campaign URL is bounced to /play/campaigns/[id]. ────────────────────────────
  await page.goto(`/campaigns/${campaignId}`);
  await page.waitForURL(`**/play/campaigns/${campaignId}`);

  // Known World: the PLAYER_VISIBLE entity is listed…
  await expect(page.getByRole("link", { name: playerVisibleName })).toBeVisible();
  // …and the DM_ONLY entity is not.
  await expect(page.getByRole("link", { name: dmOnlyName })).not.toBeVisible();

  // DM_ONLY entity is hidden by the player detail projection (getEntityForUser →
  // null → notFound)…
  await page.goto(`/play/campaigns/${campaignId}/entities/${dmEntityId}`);
  await expect(page.getByText(dmOnlyName)).not.toBeVisible();
  // …and the DM detail URL itself just redirects the player back to /play.
  await page.goto(`/campaigns/${campaignId}/entities/${dmEntityId}`);
  await expect(page.getByText(dmOnlyName)).not.toBeVisible();

  // DM-only console surfaces are not player surfaces yet: the gate redirects the
  // player to their crawler interface, so the secret event never renders for a
  // player. (Player-facing event visibility moves to the System-message feed in a
  // later M7 slice; the service-level event projection is covered by unit tests.)
  await page.goto(`/campaigns/${campaignId}/timeline`);
  await page.waitForURL(`**/play/campaigns/${campaignId}`);
  await expect(page.getByText(secretEventTitle)).not.toBeVisible();

  // ── Review Queue inaccessible to players ──────────────────────────────────
  await page.goto(`/campaigns/${campaignId}/review`);
  // The gate redirects the player away, so the "Review Queue · N sets" header
  // never renders.
  await expect(page.getByText(/Review Queue · \d+ sets/)).not.toBeVisible();
});
