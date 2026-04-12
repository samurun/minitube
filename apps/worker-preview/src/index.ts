import { config } from "@workspace/shared/config"
import { initDatabase } from "@workspace/shared/database"
import {
  connectRabbitMQ,
  closeRabbitMQ,
  QUEUE,
  type SeekingPreviewJob,
} from "@workspace/shared/rabbitmq"
import {
  registerConsumer,
  updateVideoField,
  type ConsumerHandle,
} from "@workspace/worker-core"
import { handleSeekingPreview } from "./handler"

interface PreviewResult {
  path: string
  duration: number
  interval: number
  columns: number
  totalFrames: number
  tileWidth: number
  tileHeight: number
}

let consumer: ConsumerHandle

async function start() {
  console.log("Worker (preview) starting...")
  await initDatabase()
  const ch = await connectRabbitMQ()

  await ch.prefetch(1)

  consumer = registerConsumer<SeekingPreviewJob, PreviewResult>(ch, {
    queue: QUEUE.SEEKING_PREVIEW,
    label: "seeking-preview",
    maxRetries: config.worker.maxRetries,
    handle: handleSeekingPreview,
    onSuccess: async (job, result) => {
      await updateVideoField(job.videoId, {
        seekingPreviewPath: result.path,
        seekingPreviewErrorMessage: null,
        duration: result.duration,
        seekingPreviewInterval: result.interval,
        seekingPreviewColumns: result.columns,
        seekingPreviewTotalFrames: result.totalFrames,
        seekingPreviewTileWidth: result.tileWidth,
        seekingPreviewTileHeight: result.tileHeight,
      })
    },
    onFailed: async (job, errMsg) => {
      await updateVideoField(job.videoId, {
        seekingPreviewErrorMessage: errMsg,
      })
    },
  })

  console.log("Worker (preview) ready — waiting for jobs")
}

const shutdown = async () => {
  console.log("\nWorker (preview) shutting down — draining in-flight job...")
  await consumer?.drain()
  await closeRabbitMQ()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
process.on("uncaughtException", (err) => {
  console.error("[preview] uncaughtException:", err)
})
process.on("unhandledRejection", (err) => {
  console.error("[preview] unhandledRejection:", err)
})

start()
