import { eq, and } from "drizzle-orm"
import { db, initDatabase } from "@workspace/shared/database"
import { videos } from "@workspace/shared/database/schema"
import {
  connectRabbitMQ,
  closeRabbitMQ,
  publishJob,
  QUEUE,
  type ThumbnailJob,
  type SeekingPreviewJob,
} from "@workspace/shared/rabbitmq"
import { handleThumbnail } from "./handlers/thumbnail"
import { handleSeekingPreview } from "./handlers/seeking-preview"

const MAX_RETRIES = 3

async function updateVideoField(
  videoId: number,
  fields: Partial<{
    thumbnailPath: string | null
    thumbnailErrorMessage: string | null
    seekingPreviewPath: string | null
    seekingPreviewErrorMessage: string | null
    seekingPreviewInterval: number | null
    seekingPreviewColumns: number | null
    seekingPreviewTotalFrames: number | null
    seekingPreviewTileWidth: number | null
    seekingPreviewTileHeight: number | null
  }>
) {
  await db
    .update(videos)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(videos.id, videoId))

  // Atomically check if both jobs are done → update final status
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1)

  if (!video) return

  const thumbnailDone = video.thumbnailPath || video.thumbnailErrorMessage
  const previewDone = video.seekingPreviewPath || video.seekingPreviewErrorMessage

  if (thumbnailDone && previewDone) {
    const allGood = video.thumbnailPath && video.seekingPreviewPath
    const finalStatus = allGood ? "completed" : "failed"

    // Use conditional update to avoid race with another worker
    const [updated] = await db
      .update(videos)
      .set({ status: finalStatus, updatedAt: new Date() })
      .where(
        and(eq(videos.id, videoId), eq(videos.status, "pending"))
      )
      .returning({ id: videos.id })

    if (updated) {
      console.log(`[video:${videoId}] final status: ${finalStatus}`)
    }
  }
}

async function start() {
  console.log("Worker starting...")
  await initDatabase()
  const ch = await connectRabbitMQ()

  // Process one job at a time (FFmpeg is CPU heavy)
  await ch.prefetch(1)

  // Thumbnail consumer
  ch.consume(QUEUE.THUMBNAIL, async (msg) => {
    if (!msg) return
    const job: ThumbnailJob = JSON.parse(msg.content.toString())
    console.log(`[thumbnail] video:${job.videoId} attempt:${job.attempt}`)

    try {
      const outputPath = await handleThumbnail(job)
      await updateVideoField(job.videoId, {
        thumbnailPath: outputPath,
        thumbnailErrorMessage: null,
      })
      console.log(`[thumbnail] video:${job.videoId} done`)
      ch.ack(msg)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[thumbnail] video:${job.videoId} failed: ${errMsg}`)

      ch.ack(msg) // ack the original message

      if (job.attempt + 1 < MAX_RETRIES) {
        // Retry: publish new message with incremented attempt
        publishJob(QUEUE.THUMBNAIL, { ...job, attempt: job.attempt + 1 })
      } else {
        // Give up: write error to DB
        await updateVideoField(job.videoId, {
          thumbnailErrorMessage: errMsg,
        })
        console.error(`[thumbnail] video:${job.videoId} gave up after ${MAX_RETRIES} attempts`)
      }
    }
  })

  // Seeking preview consumer
  ch.consume(QUEUE.SEEKING_PREVIEW, async (msg) => {
    if (!msg) return
    const job: SeekingPreviewJob = JSON.parse(msg.content.toString())
    console.log(`[seeking-preview] video:${job.videoId} attempt:${job.attempt}`)

    try {
      const result = await handleSeekingPreview(job)
      await updateVideoField(job.videoId, {
        seekingPreviewPath: result.path,
        seekingPreviewErrorMessage: null,
        seekingPreviewInterval: result.interval,
        seekingPreviewColumns: result.columns,
        seekingPreviewTotalFrames: result.totalFrames,
        seekingPreviewTileWidth: result.tileWidth,
        seekingPreviewTileHeight: result.tileHeight,
      })
      console.log(`[seeking-preview] video:${job.videoId} done`)
      ch.ack(msg)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[seeking-preview] video:${job.videoId} failed: ${errMsg}`)

      ch.ack(msg)

      if (job.attempt + 1 < MAX_RETRIES) {
        publishJob(QUEUE.SEEKING_PREVIEW, { ...job, attempt: job.attempt + 1 })
      } else {
        await updateVideoField(job.videoId, {
          seekingPreviewErrorMessage: errMsg,
        })
        console.error(`[seeking-preview] video:${job.videoId} gave up after ${MAX_RETRIES} attempts`)
      }
    }
  })

  console.log("Worker ready — waiting for jobs")
}

process.on("SIGINT", async () => {
  console.log("\nWorker shutting down...")
  await closeRabbitMQ()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.log("\nWorker shutting down...")
  await closeRabbitMQ()
  process.exit(0)
})

start()
