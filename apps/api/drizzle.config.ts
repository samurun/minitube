import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { defineConfig } from "drizzle-kit"

// Load .env from monorepo root
const envPath = resolve(__dirname, "../../.env")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex)
    const value = trimmed.slice(eqIndex + 1)
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

const isRunningInDocker = existsSync("/.dockerenv")

function resolveContainerHostname(value: string, containerHost: string) {
  if (isRunningInDocker) {
    return value
  }

  return value.replace(new RegExp(`^${containerHost}(?=[:/]|$)`), "localhost")
}

const postgresHost = resolveContainerHostname(
  process.env.POSTGRES_HOST || "localhost",
  "db",
)

export default defineConfig({
  out: "./drizzle",
  schema: "./src/database/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${postgresHost}:${process.env.POSTGRES_PORT || "5432"}/${process.env.POSTGRES_DB}`,
  },
})
