import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export async function withTempDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const dir = join(tmpdir(), `${prefix}-${unique}`)
  await mkdir(dir, { recursive: true })
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
