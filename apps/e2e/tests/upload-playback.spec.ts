import { test, expect } from "@playwright/test"
import { deleteVideosByTitlePrefix } from "./helpers/api"
import { uploadFixtureViaUi } from "./helpers/upload"

// Full upload → worker processing → playback flow. Requires the full stack
// (API + workers + MinIO + RabbitMQ + Postgres) running. Skipped by default
// so the default run stays fast and doesn't need a live stack.
// Enable with RUN_UPLOAD_E2E=1 pnpm e2e.
test.describe("Upload + playback flow", () => {
  test.skip(!process.env.RUN_UPLOAD_E2E, "set RUN_UPLOAD_E2E=1 to run")

  // Upload tests must not race — they all share one videos list.
  test.describe.configure({ mode: "serial" })

  const prefix = "e2e-playback"

  test.afterAll(async ({ request }) => {
    await deleteVideosByTitlePrefix(request, prefix)
  })

  test("uploads a video and plays it back via HLS", async ({ page }) => {
    test.setTimeout(240_000)

    const { stem } = await uploadFixtureViaUi(page, { prefix })

    // Server stores title without extension, so match the stem.
    const card = page.getByRole("link", { name: new RegExp(stem) })
    await expect(card).toBeVisible({ timeout: 120_000 })
    await card.click()

    await expect(page).toHaveURL(/\/watch\?v=\d+/)

    // Wait until the player has actually buffered enough metadata to play —
    // just "visible" would be satisfied by an empty <video> tag.
    const video = page.locator("video")
    await expect(video).toBeVisible({ timeout: 60_000 })
    await expect
      .poll(
        async () => video.evaluate((el: HTMLVideoElement) => el.readyState),
        { timeout: 60_000, message: "video never reached HAVE_METADATA" }
      )
      .toBeGreaterThanOrEqual(1)
  })
})
