import { expect, test } from "@playwright/test";

// The M0 "done when" bar: a user can sign up, create a campaign, and see an
// (empty) campaign dashboard.
test("sign up, create a campaign, see the empty campaign dashboard", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E DM");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password12345");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Your campaigns" }),
  ).toBeVisible();

  await page.getByLabel("Campaign name").fill("Floor One");
  await page.getByRole("button", { name: "Create campaign" }).click();

  await expect(page).toHaveURL(/\/campaigns\//);
  await expect(page.getByRole("heading", { name: "Floor One" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "This world is empty" }),
  ).toBeVisible();
});

test("unauthenticated visit to a protected route redirects to sign-in", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});
