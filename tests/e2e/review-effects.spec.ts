import { expect, test } from "@playwright/test";
import { signUpAndCreateCampaign } from "./helpers";

test("DM-applied event effect immediately applies the stat change", async ({
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
  const logForm = page.locator("form").filter({
    has: page.getByPlaceholder("What happened?"),
  });

  const eventTitle = `E2E Event ${suffix}`;
  await logForm.getByPlaceholder("What happened?").fill(eventTitle);

  // Add the crawler as a participant so its entity timeline includes the event.
  await logForm.getByLabel("Search participant...").fill(crawlerName);
  // Select from the typeahead dropdown (a button with the crawler name)
  await logForm.getByRole("button", { name: crawlerName }).first().click();
  await expect(logForm.locator('input[name="participantId_0"]')).toHaveValue(entityId);

  // Add a structured effect
  await logForm.getByRole("button", { name: "Add effect" }).click();

  // The effect row appears: set kind to ADJUST_STAT (default), target to crawler
  await logForm.getByLabel("Search crawler...").fill(crawlerName);
  // Select from the typeahead dropdown in the effect section
  await logForm.getByRole("button", { name: crawlerName }).first().click();
  await expect(logForm.locator('input[name="effectTarget_0"]')).toHaveValue(entityId);

  // Choose HP as the stat
  await logForm.locator("select[aria-label='Stat to adjust']").selectOption("hp");
  await expect(logForm.locator('select[name="effectStat_0"]')).toHaveValue("hp");

  // Set delta to 10
  await logForm.getByRole("spinbutton", { name: "Delta" }).fill("10");
  await expect(logForm.locator('input[name="effectDelta_0"]')).toHaveValue("10");

  // Submit the event
  await logForm.getByRole("button", { name: "Log event" }).click();

  // The form should close and the event should appear in the timeline
  await expect(page.getByText(eventTitle)).toBeVisible();

  // The effect chip should show the Apply button (unapplied effects)
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();

  // Click Apply. DM-applied effects are auto-approved, so no Review Queue step is needed.
  await page.getByRole("button", { name: "Apply" }).click();

  // The effect status should now show "applied" in the chip.
  await expect(page.getByText("applied", { exact: true })).toBeVisible();

  // ── Step 3: Verify the crawler's HP was updated ───────────────────────────
  await page.goto(`/campaigns/${campaignId}/entities/${entityId}`);

  // HP should now be 110 (100 + 10)
  await expect(page.getByText("110")).toBeVisible();
});
