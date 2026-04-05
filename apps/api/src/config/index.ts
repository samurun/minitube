import { existsSync } from "node:fs"

interface AppConfig {
  port: number
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
}

// Detect if running in Docker by checking for the presence of /.dockerenv
const isRunningInDocker = existsSync("/.dockerenv")

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key] || fallback
  if (!value) {
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
    rootUser: getEnv("MINIO_ROOT_USER", "minioadmin"),
    rootPassword: getEnv("MINIO_ROOT_PASSWORD", "minioadmin"),
    buckets: {
      raw: "raw",
      processed: "processed",
    },
  },
}
