import { expect, test } from "@playwright/test";
import { signUpAndCreateCampaign } from "./helpers";

test("locking an entity hides the Edit button and shows locked state", async ({
  page,
}) => {
  await signUpAndCreateCampaign(page);
  const suffix = Date.now();

  // Create an NPC entity via quick-create then navigate to its detail page
  await page.getByRole("button", { name: "Create Entity" }).click();
  await page.getByPlaceholder("New entity name…").fill(`LockTest ${suffix}`);
  await page.getByRole("button", { name: "Create and Edit" }).click();
  await page.waitForURL(/\/campaigns\/[^/]+\/entities\//);

  // Navigate to edit mode to set summary
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\?edit=/);

  // Fill summary then save so we have a proper entity
  await page.getByLabel("Summary").fill("Lock test summary");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/entities\/[^?]+$/);

  // Should be on the detail (non-edit) view
  await expect(page.getByText("Lock test summary")).toBeVisible();

  // The Edit link/button should be present while unlocked
  await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();

  // Lock the entity: the entity-level lock button (exact text "Lock")
  await page.getByRole("button", { name: "Lock", exact: true }).click();

  // After locking, the "Locked" label should appear (exact text)
  await expect(page.getByRole("button", { name: "Locked", exact: true })).toBeVisible();

  // The Edit button should now be disabled (replaced by a disabled element)
  // The page renders a disabled <button> labelled "Edit" when locked
  const editButton = page.getByRole("button", { name: "Edit" });
  await expect(editButton).toBeDisabled();
});

test("locking a field makes it read-only in the edit form", async ({ page }) => {
  await signUpAndCreateCampaign(page);
  const suffix = Date.now();

  // Create entity and set a summary
  await page.getByRole("button", { name: "Create Entity" }).click();
  await page.getByPlaceholder("New entity name…").fill(`FieldLockTest ${suffix}`);
  await page.getByRole("button", { name: "Create and Edit" }).click();
  await page.waitForURL(/\/campaigns\/[^/]+\/entities\//);

  // Navigate to edit mode
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\?edit=/);

  const summaryText = `Summary to lock ${suffix}`;
  await page.getByLabel("Summary").fill(summaryText);
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/entities\/[^?]+$/);

  // The summary field-level lock toggle (Unlock icon next to the summary text)
  // Click it to lock the summary field
  await page.getByTitle("Click to lock this field").first().click();

  // After locking, the toggle title changes to "Locked field — click to unlock"
  await expect(page.getByTitle("Locked field — click to unlock").first()).toBeVisible();

  // Navigate to the edit view and verify the summary input is read-only
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\?edit=/);

  // The summary input should be read-only when the field is locked
  const summaryInput = page.getByLabel("Summary");
  await expect(summaryInput).toHaveAttribute("readonly");
});
