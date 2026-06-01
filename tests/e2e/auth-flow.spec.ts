import { expect, test } from "@playwright/test";

// The flow starts from M0's sign-up → create crawl path, then lands on the
// World Browser (facets + card grid) with its quick-create surface.
test("sign up, create a crawl, see the entity browser", async ({
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
    page.getByRole("heading", { name: "Your crawls" }),
  ).toBeVisible();

  await page.getByLabel("Crawl name").fill("Floor One");
  await page.getByRole("button", { name: "Create crawl" }).click();

  await expect(page).toHaveURL(/\/campaigns\//);
  await expect(page.getByLabel("Switch campaign").getByText("Floor One")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Quick-create stub" }),
  ).toBeVisible();
  await expect(
    page.getByText("No entities match.", { exact: false }),
  ).toBeVisible();
});

test("unauthenticated visit to a protected route redirects to sign-in", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});
