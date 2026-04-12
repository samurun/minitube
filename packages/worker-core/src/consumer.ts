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

export function registerConsumer<TJob extends BaseJob, TResult>(
  ch: Channel,
  config: ConsumerConfig<TJob, TResult>
) {
  // amqplib does NOT await async callbacks — any rejected promise becomes an
  // unhandled rejection and crashes the process. We wrap everything in a
  // sync-returning function that catches the inner async work.
  ch.consume(config.queue, (msg) => {
    if (!msg) return
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

        ch.ack(msg)

        if (job.attempt + 1 < config.maxRetries) {
          publishJob(config.queue, { ...job, attempt: job.attempt + 1 })
        } else {
          await config.onFailed(job, errMsg)
          console.error(
            `[${config.label}] video:${job.videoId} gave up after ${config.maxRetries} attempts`
          )
        }
      }
    })().catch((fatal) => {
      // Last resort — should never reach here, but prevents process crash
      console.error(`[${config.label}] fatal unhandled error:`, fatal)
      try {
        ch.nack(msg, false, true)
      } catch {
        // channel may be closed
      }
    })
  })
}
