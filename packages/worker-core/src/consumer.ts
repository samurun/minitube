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
  ch.consume(config.queue, async (msg) => {
    if (!msg) return

    const job: TJob = JSON.parse(msg.content.toString())
    console.log(`[${config.label}] video:${job.videoId} attempt:${job.attempt}`)

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
  })
}
