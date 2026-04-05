import cors from "@elysiajs/cors"
import openapi from "@elysiajs/openapi"
import { Elysia } from "elysia"
import { config } from "./config"
import { closeDatabase, initDatabase } from "./database"
import { healthRoute } from "./modules/health"

const app = new Elysia()
  // Enable CORS for all routes
  .use(cors())

  // OpenAPI documentation
  .use(openapi())

  // Import routes
  .use(healthRoute)

// Initialize services
async function start() {
  try {
    console.log("🚀 Initializing services...")
    await initDatabase()

    app.listen({
      port: config.port,
      hostname: "0.0.0.0",
    })
    console.log(`🦊 Elysia is running at http://localhost:${config.port}`)
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...")
  try {
    await closeDatabase()
    console.log("✓ Database connection closed")
  } catch (error) {
    console.error("Error during shutdown:", error)
  }
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down gracefully...")
  try {
    await closeDatabase()
    console.log("✓ Database connection closed")
  } catch (error) {
    console.error("Error during shutdown:", error)
  }
  process.exit(0)
})

start()
