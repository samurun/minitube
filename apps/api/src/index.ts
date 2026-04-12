import cors from "@elysiajs/cors"
import openapi from "@elysiajs/openapi"
import { Elysia } from "elysia"
import { config } from "./config"
import { closeDatabase, initDatabase } from "./database"
import { initStorage } from "./storage"
import { connectRabbitMQ, closeRabbitMQ } from "@workspace/shared/rabbitmq"
import { healthRoute } from "./modules/health"
import { uploadRoute } from "./modules/upload"
import { videoRoute, hlsRoute } from "./modules/videos"

const app = new Elysia()
  // Enable CORS for configured origins
  .use(cors({ origin: config.corsOrigins }))

  // OpenAPI documentation
  .use(openapi())

  // Import routes
  .use(healthRoute)
  .use(uploadRoute)
  .use(hlsRoute)
  .use(videoRoute)

// Initialize services
async function start() {
  try {
    console.log("🚀 Initializing services...")
    await initDatabase()
    await initStorage()
    await connectRabbitMQ()

    app.listen({
      port: config.port,
      hostname: "0.0.0.0",
      maxRequestBodySize: config.upload.maxSizeMb * 1024 * 1024,
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
    await closeRabbitMQ()
    await closeDatabase()
    console.log("✓ Connections closed")
  } catch (error) {
    console.error("Error during shutdown:", error)
  }
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down gracefully...")
  try {
    await closeRabbitMQ()
    await closeDatabase()
    console.log("✓ Connections closed")
  } catch (error) {
    console.error("Error during shutdown:", error)
  }
  process.exit(0)
})

start()
