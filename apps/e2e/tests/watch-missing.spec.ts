import { test, expect } from "@playwright/test"

test.describe("Watch page error states", () => {
  test("shows not-found state when v query param is missing", async ({
    page,
  }) => {
    await page.goto("/watch")
    await expect(page.getByText("Video not found")).toBeVisible()
    await expect(page.getByText(/Missing or invalid video ID/i)).toBeVisible()
  })

  test("shows failed-to-load state for an unknown id", async ({ page }) => {
    test.skip(!process.env.RUN_UPLOAD_E2E, "needs the API to be reachable")
    await page.goto("/watch?v=99999999")
    await expect(page.getByText("Failed to load video")).toBeVisible()
  })
})
