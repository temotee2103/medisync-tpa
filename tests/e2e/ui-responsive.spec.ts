import { test, expect } from "@playwright/test";

test.describe("responsive smoke", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("provider portal redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/provider/invoices");
    await page.waitForURL(/\/provider\/login/);
    await expect(page).toHaveURL(/\/provider\/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("member portal redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/member/claims");
    await page.waitForURL(/\/member\/login/);
    await expect(page).toHaveURL(/\/member\/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("admin portal redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForURL(/\/admin\/login/);
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("provider login page renders form elements on mobile", async ({ page }) => {
    await page.goto("/provider/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
