import { expect, test } from "@playwright/test";

test("inspect settings page buttons when configured", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // 1. Sign up
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E DM");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password12345");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/);

  // 2. Create a crawl
  await page.getByLabel("Crawl name").fill("Settings Test Floor");
  await page.getByRole("button", { name: "Create crawl" }).click();

  await expect(page).toHaveURL(/\/campaigns\//);
  const url = page.url();
  const campaignId = url.split("/campaigns/")[1].split("/")[0].split("?")[0];
  console.log("CAMPAIGN ID:", campaignId);

  // 3. Go to settings page
  await page.goto(`/campaigns/${campaignId}/settings`);
  await expect(page.getByRole("heading", { name: "Campaign settings" })).toBeVisible();

  // Take screenshot before configuration
  const artifactDir = "/Users/trevor/.gemini/antigravity-cli/brain/f38d965f-dd50-4365-81f9-a65308c0b216";
  const compatRow = page.locator('div.border-b').filter({ has: page.locator('span', { hasText: /OpenAI-compatible/ }) });
  await compatRow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifactDir}/settings_before.png` });
  console.log("Screenshot before configuration saved!");

  // Log unconfigured button properties
  const initButtons = page.locator('button:has-text("Save"), button:has-text("Replace")');
  const initCount = await initButtons.count();
  console.log(`Found ${initCount} Save/Replace buttons in initial state.`);
  for (let i = 0; i < initCount; i++) {
    const btn = initButtons.nth(i);
    const text = await btn.innerText();
    const disabled = await btn.getAttribute("disabled");
    const disabledProp = await btn.evaluate(el => (el as HTMLButtonElement).disabled);
    const className = await btn.getAttribute("class");
    console.log(`INIT BUTTON ${i}: Text="${text}" DisabledAttr=${disabled} DisabledProp=${disabledProp} Class="${className}"`);
  }

  // 4. Configure Anthropic
  console.log("Saving Anthropic key...");
  await page.getByLabel("Anthropic (Claude) API key").fill("sk-ant-12345678901234567890");
  await page.locator('div.border-b').filter({ has: page.locator('span', { hasText: /^Anthropic \(Claude\)$/ }) }).locator('button:has-text("Save")').click();
  await expect(page.getByText("Saved Anthropic (Claude)")).toBeVisible();

  // 5. Configure OpenAI
  console.log("Saving OpenAI key...");
  await page.getByLabel("OpenAI API key").fill("sk-12345678901234567890");
  await page.locator('div.border-b').filter({ has: page.locator('span', { hasText: /^OpenAI$/ }) }).locator('button:has-text("Save")').click();
  await expect(page.getByText("Saved OpenAI")).toBeVisible();

  // 6. Configure OpenAI-compatible
  console.log("Saving OpenAI-compatible...");
  await page.getByLabel("OpenAI-compatible (self-hosted / proxy) endpoint URL").fill("http://localhost:11434/v1");
  await page.getByLabel("OpenAI-compatible (self-hosted / proxy) model").fill("llama3.1");
  await page.getByLabel("OpenAI-compatible (self-hosted / proxy) API key").fill("some-local-key");
  await page.locator('div.border-b').filter({ has: page.locator('span', { hasText: /OpenAI-compatible/ }) }).locator('button:has-text("Save")').click();
  await expect(page.getByText("Saved OpenAI-compatible (self-hosted / proxy)")).toBeVisible();

  console.log("All keys saved!");

  // Take screenshot after configuration
  await compatRow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifactDir}/settings_after.png` });
  console.log("Screenshot after configuration saved!");

  // 7. Locate all Save/Replace buttons now
  const saveButtons = page.locator('button:has-text("Save"), button:has-text("Replace")');
  const count = await saveButtons.count();
  console.log(`Found ${count} Save/Replace buttons in configured state.`);

  for (let i = 0; i < count; i++) {
    const btn = saveButtons.nth(i);
    const text = await btn.innerText();
    const disabled = await btn.getAttribute("disabled");
    const className = await btn.getAttribute("class");
    const parentHtml = await btn.evaluate(el => el.parentElement?.outerHTML);
    const computedStyle = await btn.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor,
        opacity: style.opacity,
      };
    });

    console.log(`BUTTON ${i}:`);
    console.log(`  Text: "${text}"`);
    console.log(`  Disabled: ${disabled}`);
    console.log(`  Class: "${className}"`);
    console.log(`  Computed Style:`, computedStyle);
  }
});
