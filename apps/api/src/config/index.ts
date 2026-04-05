import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

interface AppConfig {
  port: number
  corsOrigins: string[]
  postgres: {
    host: string
    port: number
    database: string
    user: string
    password: string
  }
  minio: {
    endpoint: string
    publicEndpoint: string
    useSSL: boolean
    rootUser: string
    rootPassword: string
    buckets: {
      raw: string
      processed: string
    }
  }
  preview: {
    frameIntervalSeconds: number
    columnsPerRow: number
    tileWidth: number
    tileHeight: number
  }
}

// Detect if running in Docker by checking for the presence of /.dockerenv
const isRunningInDocker = existsSync("/.dockerenv")

for (const envPath of [resolve(process.cwd(), ".env")]) {
  if (!existsSync(envPath)) continue

  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex)
    const value = trimmed.slice(eqIndex + 1)

    if (process.env[key] == null && Bun.env[key] == null) {
      process.env[key] = value
    }
  }
}

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? Bun.env[key] ?? fallback
  if (value == null || value === "") {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value
}

// Resolve hostnames to localhost when not running in Docker, to simplify local development
function resolveContainerHostname(
  value: string,
  containerHost: string
): string {
  if (isRunningInDocker) {
    return value
  }

  return value.replace(new RegExp(`^${containerHost}(?=[:/]|$)`), "localhost")
}

export const config: AppConfig = {
  port: parseInt(getEnv("PORT", "4000"), 10),
  corsOrigins: getEnv("CORS_ORIGINS", "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  postgres: {
    host: resolveContainerHostname(getEnv("POSTGRES_HOST", "localhost"), "db"),
    port: parseInt(getEnv("POSTGRES_PORT", "5432"), 10),
    database: getEnv("POSTGRES_DB"),
    user: getEnv("POSTGRES_USER"),
    password: getEnv("POSTGRES_PASSWORD"),
  },
  minio: {
    endpoint: resolveContainerHostname(
      getEnv("MINIO_ENDPOINT", "localhost:9000"),
      "minio"
    ),
    publicEndpoint:
      process.env.MINIO_PUBLIC_ENDPOINT ||
      resolveContainerHostname(
        getEnv("MINIO_ENDPOINT", "localhost:9000"),
        "minio"
      ),
    useSSL: getEnv("MINIO_USE_SSL", "false") === "true",
    rootUser: getEnv("MINIO_ROOT_USER"),
    rootPassword: getEnv("MINIO_ROOT_PASSWORD"),
    buckets: {
      raw: "raw",
      processed: "processed",
    },
  },

  preview: {
    frameIntervalSeconds: Math.max(
      1,
      parseInt(getEnv("PREVIEW_FRAME_INTERVAL_SECONDS", "1"), 10) || 1
    ),
    columnsPerRow: Math.max(
      1,
      parseInt(getEnv("PREVIEW_COLUMNS_PER_ROW", "60"), 10) || 60
    ),
    tileWidth: Math.max(
      40,
      parseInt(getEnv("PREVIEW_TILE_WIDTH", "160"), 10) || 160
    ),
    tileHeight: Math.max(
      24,
      parseInt(getEnv("PREVIEW_TILE_HEIGHT", "90"), 10) || 90
    ),
  },
}
