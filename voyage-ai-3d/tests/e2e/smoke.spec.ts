import { test, expect } from "@playwright/test";

/**
 * Phase 0 e2e smoke test: the landing page boots and renders the app name.
 * Full user journeys (upload -> view -> edit -> export) arrive in Phase 7.
 */
test("landing page renders the app name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Voyage AI 3D" })).toBeVisible();
});
