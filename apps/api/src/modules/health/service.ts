import { checkDatabaseHealth } from "../../database"

export async function getHealthStatus() {
  const [database] = await Promise.all([checkDatabaseHealth()])

  return {
    status: database === "connected" ? "OK" : "DEGRADED",
    timestamp: new Date().toISOString(),
    database,
  }
}
