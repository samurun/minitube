import { sql, eq, and } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { config } from "../config"
import * as schema from "./schema"

const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
})

export const db = drizzle(pool, { schema })

pool.on("error", (error) => {
  console.error("Unexpected error on idle client", error)
})

export async function checkDatabaseHealth() {
  try {
    await db.execute(sql`SELECT 1`)
    return "connected" as const
  } catch {
    return "disconnected" as const
  }
}

export async function initDatabase() {
  try {
    await db.execute(sql`SELECT NOW()`)
    console.log("✓ PostgreSQL connected")
  } catch (error) {
    console.error("Database initialization failed:", error)
    throw error
  }
}

export async function closeDatabase() {
  await pool.end()
}

export { eq, and }
