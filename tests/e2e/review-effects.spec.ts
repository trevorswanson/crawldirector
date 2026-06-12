import { expect, test } from "@playwright/test";
import { signUpAndCreateCampaign } from "./helpers";

test("event effect lands PENDING in the Review Queue and approving it applies the stat change", async ({
  page,
}) => {
  const { campaignId } = await signUpAndCreateCampaign(page);
  const suffix = Date.now();

  // ── Step 1: Create a CRAWLER entity ──────────────────────────────────────
  const crawlerName = `Crawler ${suffix}`;
  await page.getByRole("button", { name: "Create Entity" }).click();
  await page.getByPlaceholder("New entity name…").fill(crawlerName);
  await page.locator("select[name='type']").selectOption("CRAWLER");
  // "Create and Edit" redirects to entity detail page (read mode)
  await page.getByRole("button", { name: "Create and Edit" }).click();
  await page.waitForURL(/\/campaigns\/[^/]+\/entities\//);

  // Parse the entity id so we can visit the detail page later
  const entityUrl = page.url();
  const entityIdMatch = entityUrl.match(/\/entities\/([^/?#]+)/);
  if (!entityIdMatch) throw new Error("Could not parse entity id from " + entityUrl);
  const entityId = entityIdMatch[1];

  // Navigate to edit mode to set HP
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\?edit=/);

  // Set HP to 100
  await page.getByLabel("HP").fill("100");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/entities\/[^?]+$/);

  // Confirm HP is shown in the fields table on the detail page (value "100")
  await expect(page.getByText("100", { exact: true })).toBeVisible();

  // ── Step 2: Go to timeline and create an event with an ADJUST_STAT effect ─
  await page.goto(`/campaigns/${campaignId}/timeline`);
  await page.getByRole("button", { name: "Log event" }).click();

  const eventTitle = `E2E Event ${suffix}`;
  await page.getByPlaceholder("What happened?").fill(eventTitle);

  // The form requires at least one participant — search for the crawler
  await page.getByLabel("Search participant...").fill(crawlerName);
  // Select from the typeahead dropdown (a button with the crawler name)
  await page.getByRole("button", { name: crawlerName }).first().click();

  // Add a structured effect
  await page.getByRole("button", { name: "Add effect" }).click();

  // The effect row appears: set kind to ADJUST_STAT (default), target to crawler
  await page.getByLabel("Search crawler...").fill(crawlerName);
  // Select from the typeahead dropdown in the effect section
  await page.getByRole("button", { name: crawlerName }).first().click();

  // Choose HP as the stat
  await page.locator("select[aria-label='Stat to adjust']").selectOption("hp");

  // Set delta to 10
  await page.getByRole("spinbutton", { name: "Delta" }).fill("10");

  // Submit the event
  await page.getByRole("button", { name: "Log event" }).click();

  // The form should close and the event should appear in the timeline
  await expect(page.getByText(eventTitle)).toBeVisible();

  // The effect chip should show the Apply button (unapplied effects)
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();

  // Click Apply to route through the review pipeline
  await page.getByRole("button", { name: "Apply" }).click();

  // The effect status should now show "pending review" in the chip
  await expect(page.getByText("pending review")).toBeVisible();

  // ── Step 3: Verify Review Queue shows PENDING APPLY_EVENT_EFFECTS ─────────
  await page.goto(`/campaigns/${campaignId}/review`);

  // The queue should have a change set with the Apply effects title
  await expect(page.getByText("Apply effects")).toBeVisible();

  // ── Step 4: Approve the change set ──────────────────────────────────────
  // The first change set in the queue should already be selected (the sidebar
  // auto-selects the first item). Click "Accept all" on the operation row.
  await page.getByRole("button", { name: "Accept all" }).click();

  // Then click the "Approve N accepted" button in the header
  await page.getByRole("button", { name: /Approve \d+ accepted/ }).click();

  // Post-approval: the "Committed to canon" confirmation should appear
  await expect(page.getByText("Committed to canon")).toBeVisible();

  // ── Step 5: Verify the crawler's HP was updated ───────────────────────────
  await page.goto(`/campaigns/${campaignId}/entities/${entityId}`);

  // HP should now be 110 (100 + 10)
  await expect(page.getByText("110")).toBeVisible();
});
