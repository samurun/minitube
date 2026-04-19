import { expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures"
)

export function readFixture(name = "sample.mp4"): Buffer {
  return readFileSync(resolve(fixtureDir, name))
}

export interface UploadResult {
  stem: string
  fileName: string
}

export async function uploadFixtureViaUi(
  page: Page,
  opts: { prefix?: string; fixture?: string } = {}
): Promise<UploadResult> {
  const prefix = opts.prefix ?? "e2e"
  const stem = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const fileName = `${stem}.mp4`

  await page.goto("/")
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "video/mp4",
    buffer: readFixture(opts.fixture),
  })
  await page.getByRole("button", { name: "Upload" }).click()
  await expect(
    page.getByText("Uploaded — processing in background")
  ).toBeVisible({ timeout: 60_000 })

  // Force a fresh list fetch — the app's optimistic cache can miss if the
  // videos query hadn't resolved before we clicked Upload, and there is no
  // automatic invalidateQueries on upload success.
  await page.reload()

  return { stem, fileName }
}
