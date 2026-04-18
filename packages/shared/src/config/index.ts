import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { z } from "zod"

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
  transcode: {
    ffmpegThreads: number
    hlsSegmentDuration: number
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

// Resolve hostnames to localhost when not running in Docker, to simplify
// local development where containers expose themselves on 127.0.0.1.
function resolveContainerHostname(value: string, containerHost: string) {
  if (isRunningInDocker) return value
  return value.replace(new RegExp(`^${containerHost}(?=[:/]|$)`), "localhost")
}

const intString = (fallback: number, min = Number.NEGATIVE_INFINITY) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v == null || v === "" ? fallback : parseInt(v, 10)
      return Number.isFinite(n) ? Math.max(min, n) : fallback
    })

const clampedInt = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v == null || v === "" ? fallback : parseInt(v, 10)
      if (!Number.isFinite(n)) return fallback
      return Math.min(max, Math.max(min, n))
    })

const requiredString = (name: string) =>
  z.string({ required_error: `Missing environment variable: ${name}` }).min(1, {
    message: `Missing environment variable: ${name}`,
  })

const envSchema = z.object({
  PORT: intString(4000, 1),
  CORS_ORIGINS: z
    .string()
    .optional()
    .default("http://localhost:3000")
    .transform((v) =>
      v
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    ),

  POSTGRES_HOST: z.string().optional().default("localhost"),
  POSTGRES_PORT: intString(5432, 1),
  POSTGRES_DB: requiredString("POSTGRES_DB"),
  POSTGRES_USER: requiredString("POSTGRES_USER"),
  POSTGRES_PASSWORD: requiredString("POSTGRES_PASSWORD"),

  MINIO_ENDPOINT: z.string().optional().default("localhost:9000"),
  MINIO_PUBLIC_ENDPOINT: z.string().optional(),
  MINIO_USE_SSL: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  MINIO_ROOT_USER: requiredString("MINIO_ROOT_USER"),
  MINIO_ROOT_PASSWORD: requiredString("MINIO_ROOT_PASSWORD"),

  RABBITMQ_HOST: z.string().optional().default("localhost"),
  RABBITMQ_PORT: intString(5672, 1),
  RABBITMQ_USER: z.string().optional().default("admin"),
  RABBITMQ_PASS: z.string().optional().default("admin"),

  UPLOAD_MAX_SIZE_MB: intString(1024, 1),

  WORKER_MAX_RETRIES: intString(3, 1),
  FFMPEG_THREADS: intString(1, 1),

  THUMBNAIL_TIMESTAMP_SEC: intString(1, 0),
  THUMBNAIL_QUALITY: clampedInt(2, 1, 31),

  TRANSCODE_FFMPEG_THREADS: intString(2, 1),
  HLS_SEGMENT_DURATION: intString(6, 2),
})

function parseEnv() {
  const source = { ...Bun.env, ...process.env }
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return result.data
}

const env = parseEnv()

export const config: AppConfig = {
  port: env.PORT,
  corsOrigins: env.CORS_ORIGINS,
  postgres: {
    host: resolveContainerHostname(env.POSTGRES_HOST, "db"),
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
  },
  minio: {
    endpoint: resolveContainerHostname(env.MINIO_ENDPOINT, "minio"),
    publicEndpoint:
      env.MINIO_PUBLIC_ENDPOINT ??
      resolveContainerHostname(env.MINIO_ENDPOINT, "minio"),
    useSSL: env.MINIO_USE_SSL,
    rootUser: env.MINIO_ROOT_USER,
    rootPassword: env.MINIO_ROOT_PASSWORD,
    buckets: {
      raw: "raw",
      processed: "processed",
    },
  },
  rabbitmq: {
    host: resolveContainerHostname(env.RABBITMQ_HOST, "rabbitmq"),
    port: env.RABBITMQ_PORT,
    user: env.RABBITMQ_USER,
    pass: env.RABBITMQ_PASS,
  },
  upload: {
    maxSizeMb: env.UPLOAD_MAX_SIZE_MB,
  },
  worker: {
    maxRetries: env.WORKER_MAX_RETRIES,
    ffmpegThreads: env.FFMPEG_THREADS,
  },
  thumbnail: {
    timestampSec: env.THUMBNAIL_TIMESTAMP_SEC,
    quality: env.THUMBNAIL_QUALITY,
  },
  transcode: {
    ffmpegThreads: env.TRANSCODE_FFMPEG_THREADS,
    hlsSegmentDuration: env.HLS_SEGMENT_DURATION,
  },
}
