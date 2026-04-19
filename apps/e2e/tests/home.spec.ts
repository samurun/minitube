import { test, expect } from "@playwright/test"

test.describe("Home page", () => {
  test("renders upload form and video list heading", async ({ page }) => {
    await page.goto("/")

    await expect(
      page.getByRole("heading", { name: "Upload Video" })
    ).toBeVisible()
    await expect(
      page.getByText("Drag and drop or click to upload")
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Choose file" })
    ).toBeVisible()
  })
})
