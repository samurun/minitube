import { createLogger } from "@workspace/shared/logger"
import { publishJob, type Channel } from "@workspace/shared/rabbitmq"

export interface BaseJob {
  videoId: number
  rawPath: string
  attempt: number
}

export interface ConsumerConfig<TJob extends BaseJob, TResult> {
  queue: string
  label: string
  maxRetries: number
  handle: (job: TJob) => Promise<TResult>
  onSuccess: (job: TJob, result: TResult) => Promise<void>
  onFailed: (job: TJob, errorMessage: string) => Promise<void>
}

export interface ConsumerHandle {
  /** Stop accepting new messages and wait for the in-flight job to finish */
  drain: () => Promise<void>
}

export function registerConsumer<TJob extends BaseJob, TResult>(
  ch: Channel,
  config: ConsumerConfig<TJob, TResult>
): ConsumerHandle {
  const logger = createLogger(`consumer.${config.label}`)
  let consumerTag: string | undefined
  let inFlight: Promise<void> | null = null
  let inFlightResolve: (() => void) | null = null

  // amqplib does NOT await async callbacks — any rejected promise becomes an
  // unhandled rejection and crashes the process. We wrap everything in a
  // sync-returning function that catches the inner async work.
  ch.consume(config.queue, (msg) => {
    if (!msg) return
    inFlight = new Promise((resolve) => {
      inFlightResolve = resolve
    })
    void (async () => {
      let parsed: TJob
      try {
        parsed = JSON.parse(msg.content.toString())
      } catch {
        logger.error("failed to parse message, discarding")
        ch.ack(msg)
        return
      }

      const job = parsed
      const jobLog = logger.child({
        videoId: job.videoId,
        attempt: job.attempt,
      })
      jobLog.info("job received")

      try {
        const result = await config.handle(job)
        await config.onSuccess(job, result)
        jobLog.info("job done")
        ch.ack(msg)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        jobLog.error("job failed", { err: errMsg })

        if (job.attempt + 1 < config.maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, ...
          const delayMs = 1000 * Math.pow(2, job.attempt)
          jobLog.info("retrying", { delayMs })
          await new Promise((r) => setTimeout(r, delayMs))
          publishJob(config.queue, { ...job, attempt: job.attempt + 1 })
        } else {
          await config.onFailed(job, errMsg)
          jobLog.error("gave up", { maxRetries: config.maxRetries })
        }

        // Ack AFTER retry/onFailed completes so the message isn't lost
        // if those operations throw (caught by the outer .catch)
        ch.ack(msg)
      }
    })()
      .catch((fatal) => {
        // Last resort — should never reach here, but prevents process crash
        logger.error("fatal unhandled error", {
          err: fatal instanceof Error ? fatal.message : String(fatal),
        })
        try {
          ch.nack(msg, false, true)
        } catch {
          // channel may be closed
        }
      })
      .finally(() => {
        inFlightResolve?.()
        inFlight = null
        inFlightResolve = null
      })
  }).then((reply) => {
    consumerTag = reply.consumerTag
  })

  return {
    drain: async () => {
      if (consumerTag) {
        await ch.cancel(consumerTag)
      }
      if (inFlight) {
        await inFlight
      }
    },
  }
}
