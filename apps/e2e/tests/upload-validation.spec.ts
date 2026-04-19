import { test, expect } from "@playwright/test"

test.describe("Upload validation", () => {
  test("rejects non-video file types at the client", async ({ page }) => {
    await page.goto("/")

    await page.locator('input[type="file"]').setInputFiles({
      name: "not-a-video.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("this is not a video"),
    })

    await expect(page.getByText(/Unsupported file type/i)).toBeVisible()
    // Upload button must not appear for an invalid file.
    await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(0)
  })
})
