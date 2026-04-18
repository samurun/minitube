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
import { errorHandler } from "./shared/error-handler"
import { logger } from "./shared/logger"

const app = new Elysia()
  .use(errorHandler)
  .use(cors({ origin: config.corsOrigins }))
  .use(openapi())
  .use(healthRoute)
  .use(uploadRoute)
  .use(hlsRoute)
  .use(videoRoute)

async function start() {
  try {
    logger.info("initializing services")
    await initDatabase()
    await initStorage()
    await connectRabbitMQ()

    app.listen({
      port: config.port,
      hostname: "0.0.0.0",
      maxRequestBodySize: config.upload.maxSizeMb * 1024 * 1024,
    })
    logger.info("API server started", { port: config.port })
  } catch (err) {
    logger.error("failed to start server", {
      err: err instanceof Error ? err.message : String(err),
    })
    process.exit(1)
  }
}

async function shutdown(signal: string) {
  logger.info("shutting down", { signal })
  try {
    await closeRabbitMQ()
    await closeDatabase()
    logger.info("connections closed")
  } catch (err) {
    logger.error("error during shutdown", {
      err: err instanceof Error ? err.message : String(err),
    })
  }
  process.exit(0)
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

start()
