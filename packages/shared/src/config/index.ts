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
  rabbitmq: {
    host: string
    port: number
    user: string
    pass: string
  }
  upload: {
    maxSizeMb: number
  }
  worker: {
    maxRetries: number
    ffmpegThreads: number
  }
  thumbnail: {
    timestampSec: number
    quality: number
  }
}

// Detect if running in Docker by checking for the presence of /.dockerenv
const isRunningInDocker = existsSync("/.dockerenv")

// Look for .env at cwd first, then walk up to monorepo root
const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]

for (const envPath of envCandidates) {
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
  rabbitmq: {
    host: resolveContainerHostname(
      getEnv("RABBITMQ_HOST", "localhost"),
      "rabbitmq"
    ),
    port: parseInt(getEnv("RABBITMQ_PORT", "5672"), 10),
    user: getEnv("RABBITMQ_USER", "admin"),
    pass: getEnv("RABBITMQ_PASS", "admin"),
  },
  upload: {
    maxSizeMb: Math.max(
      1,
      parseInt(getEnv("UPLOAD_MAX_SIZE_MB", "1024"), 10) || 1024
    ),
  },
  worker: {
    maxRetries: Math.max(
      1,
      parseInt(getEnv("WORKER_MAX_RETRIES", "3"), 10) || 3
    ),
    ffmpegThreads: Math.max(
      1,
      parseInt(getEnv("FFMPEG_THREADS", "1"), 10) || 1
    ),
  },
  thumbnail: {
    timestampSec: Math.max(
      0,
      parseInt(getEnv("THUMBNAIL_TIMESTAMP_SEC", "1"), 10) ?? 1
    ),
    quality: Math.max(
      1,
      Math.min(
        31,
        parseInt(getEnv("THUMBNAIL_QUALITY", "2"), 10) || 2
      )
    ),
  },
}
