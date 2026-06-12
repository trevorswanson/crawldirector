import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { signUpAndCreateCampaign } from "./helpers";

test("quick-create stub appears in the card grid", async ({ page }) => {
  await signUpAndCreateCampaign(page);

  // Open the quick-create inline form via the "Create Entity" button
  await page.getByRole("button", { name: "Create Entity" }).click();

  // Fill the stub name and submit with "Create stub" to stay on the browser
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const stubName = `Stub Entity ${suffix}`;
  await page.getByPlaceholder("New entity name…").fill(stubName);
  await page.getByRole("button", { name: "Create stub" }).click();

  // The card should appear in the grid (use the card link, not the toast)
  await expect(page.getByRole("link", { name: stubName })).toBeVisible();
});

test("create full entity via Create Entity button and see detail page", async ({ page }) => {
  await signUpAndCreateCampaign(page);

  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const entityName = `NPC Full ${suffix}`;
  const entitySummary = `Summary for ${entityName}`;

  // "Create and Edit" redirects to the entity detail page (read mode).
  // Then navigate to edit mode via the Edit link.
  await page.getByRole("button", { name: "Create Entity" }).click();
  await page.getByPlaceholder("New entity name…").fill(entityName);
  // Keep type as NPC (default)
  await page.getByRole("button", { name: "Create and Edit" }).click();

  // Should redirect to entity detail page (read mode)
  await page.waitForURL(/\/campaigns\/[^/]+\/entities\//);

  // The entity name should be shown in the heading
  await expect(page.getByRole("heading", { name: entityName })).toBeVisible();

  // Navigate to edit mode
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\?edit=/);

  // Fill in summary
  await page.getByLabel("Summary").fill(entitySummary);
  // Save via the Save button in the rail
  await page.getByRole("button", { name: "Save" }).click();

  // Wait for the redirect back to the detail view
  await page.waitForURL(/\/entities\/[^?]+$/);

  // The entity detail page should now show the summary
  await expect(page.getByText(entitySummary)).toBeVisible();
});

test("type facet filters the entity list", async ({ page }) => {
  await signUpAndCreateCampaign(page);

  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

  // Create an NPC stub
  await page.getByRole("button", { name: "Create Entity" }).click();
  await page.getByPlaceholder("New entity name…").fill(`NPC ${suffix}`);
  await page.locator("select[name='type']").selectOption("NPC");
  await page.getByRole("button", { name: "Create stub" }).click();
  // Wait for the card to appear in the grid
  await expect(page.getByRole("link", { name: `NPC ${suffix}` })).toBeVisible();

  // The quick-create form is still open after "Create stub" — reuse it
  // (clicking "Create Entity" again would toggle the form closed)
  await page.getByPlaceholder("New entity name…").fill(`Crawler ${suffix}`);
  await page.locator("select[name='type']").selectOption("CRAWLER");
  await page.getByRole("button", { name: "Create stub" }).click();
  await expect(page.getByRole("link", { name: `Crawler ${suffix}` })).toBeVisible();

  // Click the NPC facet in the sidebar
  await page.getByRole("link", { name: /NPC/i }).first().click();
  await page.waitForURL(/type=NPC/);

  // NPC should be visible, CRAWLER should not
  await expect(page.getByRole("link", { name: `NPC ${suffix}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `Crawler ${suffix}` })).not.toBeVisible();
});
