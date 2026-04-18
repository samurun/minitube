import { config } from "@workspace/shared/config"
import { closeDatabase, initDatabase } from "@workspace/shared/database"
import { createLogger, type Logger } from "@workspace/shared/logger"
import {
  closeRabbitMQ,
  connectRabbitMQ,
} from "@workspace/shared/rabbitmq"
import {
  registerConsumer,
  type BaseJob,
  type ConsumerHandle,
} from "./consumer"

export interface WorkerRuntimeConfig<TJob extends BaseJob, TResult> {
  /** RabbitMQ queue name */
  queue: string
  /** Short label used for logs (e.g. "thumbnail") */
  label: string
  /** Job handler */
  handle: (job: TJob, ctx: { logger: Logger }) => Promise<TResult>
  onSuccess: (job: TJob, result: TResult) => Promise<void>
  onFailed: (job: TJob, errorMessage: string) => Promise<void>
  /** Override max retries (defaults to config.worker.maxRetries) */
  maxRetries?: number
  /** Override prefetch (defaults to 1) */
  prefetch?: number
}

/**
 * Bootstraps a worker process:
 *  1. initDatabase + connectRabbitMQ
 *  2. registers the consumer with graceful drain on SIGINT/SIGTERM
 *  3. logs through the shared JSON logger (no console.*)
 *
 * Replaces the ~45 lines of boilerplate that used to live in each
 * apps/worker-*\/src/index.ts.
 */
export async function startWorker<TJob extends BaseJob, TResult>(
  cfg: WorkerRuntimeConfig<TJob, TResult>
): Promise<void> {
  const logger = createLogger(`worker.${cfg.label}`)

  logger.info("starting")
  await initDatabase()
  const ch = await connectRabbitMQ()
  await ch.prefetch(cfg.prefetch ?? 1)

  const consumer: ConsumerHandle = registerConsumer<TJob, TResult>(ch, {
    queue: cfg.queue,
    label: cfg.label,
    maxRetries: cfg.maxRetries ?? config.worker.maxRetries,
    handle: (job) =>
      cfg.handle(job, {
        logger: logger.child({ videoId: job.videoId, attempt: job.attempt }),
      }),
    onSuccess: cfg.onSuccess,
    onFailed: cfg.onFailed,
  })

  logger.info("ready")

  const shutdown = async (signal: string) => {
    logger.info("shutting down", { signal })
    try {
      await consumer.drain()
      await closeRabbitMQ()
      await closeDatabase()
    } catch (err) {
      logger.error("shutdown error", {
        err: err instanceof Error ? err.message : String(err),
      })
    }
    process.exit(0)
  }

  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("uncaughtException", (err) => {
    logger.error("uncaughtException", { err: err.message, stack: err.stack })
  })
  process.on("unhandledRejection", (err) => {
    logger.error("unhandledRejection", {
      err: err instanceof Error ? err.message : String(err),
    })
  })
}
