import { test, expect } from "@playwright/test"
import { deleteVideosByTitlePrefix, listVideos } from "./helpers/api"
import { uploadFixtureViaUi } from "./helpers/upload"

test.describe("Delete video flow", () => {
  test.skip(!process.env.RUN_UPLOAD_E2E, "set RUN_UPLOAD_E2E=1 to run")

  test.describe.configure({ mode: "serial" })

  const prefix = "e2e-delete"

  test.afterAll(async ({ request }) => {
    await deleteVideosByTitlePrefix(request, prefix)
  })

  test("deletes a video through the card dropdown", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000)

    const { stem } = await uploadFixtureViaUi(page, { prefix })

    const card = page.getByRole("link", { name: new RegExp(stem) })
    await expect(card).toBeVisible({ timeout: 120_000 })

    // Hover to expose the actions button (it's opacity:0 until group-hover).
    await card.hover()
    await page
      .getByRole("button", { name: new RegExp(`Actions for ${stem}`) })
      .click()
    await page.getByRole("menuitem", { name: "ลบ" }).click()
    await page.getByRole("button", { name: "ลบ" }).click()

    await expect(card).toHaveCount(0, { timeout: 15_000 })

    // Confirm the row is actually gone on the server, not just the client.
    const remaining = await listVideos(request)
    expect(remaining.some((v) => v.title.startsWith(stem))).toBe(false)
  })
})
