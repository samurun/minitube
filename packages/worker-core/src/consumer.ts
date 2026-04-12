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
        console.error(`[${config.label}] failed to parse message, discarding`)
        ch.ack(msg)
        return
      }

      const job = parsed

      console.log(
        `[${config.label}] video:${job.videoId} attempt:${job.attempt}`
      )

      try {
        const result = await config.handle(job)
        await config.onSuccess(job, result)
        console.log(`[${config.label}] video:${job.videoId} done`)
        ch.ack(msg)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(
          `[${config.label}] video:${job.videoId} failed: ${errMsg}`
        )

        if (job.attempt + 1 < config.maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, ...
          const delayMs = 1000 * Math.pow(2, job.attempt)
          console.log(
            `[${config.label}] video:${job.videoId} retrying in ${delayMs}ms`
          )
          await new Promise((r) => setTimeout(r, delayMs))
          publishJob(config.queue, { ...job, attempt: job.attempt + 1 })
        } else {
          await config.onFailed(job, errMsg)
          console.error(
            `[${config.label}] video:${job.videoId} gave up after ${config.maxRetries} attempts`
          )
        }

        // Ack AFTER retry/onFailed completes so the message isn't lost
        // if those operations throw (caught by the outer .catch)
        ch.ack(msg)
      }
    })()
      .catch((fatal) => {
        // Last resort — should never reach here, but prevents process crash
        console.error(`[${config.label}] fatal unhandled error:`, fatal)
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
