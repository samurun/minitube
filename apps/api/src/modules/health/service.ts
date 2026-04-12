import { checkDatabaseHealth } from "../../database"
import { minioClient } from "../../storage"
import { getChannel } from "@workspace/shared/rabbitmq"

async function checkMinioHealth() {
  try {
    await minioClient.bucketExists("raw")
    return "connected" as const
  } catch {
    return "disconnected" as const
  }
}

function checkRabbitMQHealth() {
  try {
    getChannel()
    return "connected" as const
  } catch {
    return "disconnected" as const
  }
}

export async function getHealthStatus() {
  const [database, minio] = await Promise.all([
    checkDatabaseHealth(),
    checkMinioHealth(),
  ])
  const rabbitmq = checkRabbitMQHealth()

  const allConnected =
    database === "connected" &&
    minio === "connected" &&
    rabbitmq === "connected"

  return {
    status: allConnected ? "OK" : "DEGRADED",
    timestamp: new Date().toISOString(),
    database,
    minio,
    rabbitmq,
  }
}
