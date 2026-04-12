import { initDatabase } from "@workspace/shared/database"
import {
  connectRabbitMQ,
  closeRabbitMQ,
  QUEUE,
  type SeekingPreviewJob,
} from "@workspace/shared/rabbitmq"
import { registerConsumer, updateVideoField } from "@workspace/worker-core"
import { handleSeekingPreview } from "./handler"

const MAX_RETRIES = 3

interface PreviewResult {
  path: string
  duration: number
  interval: number
  columns: number
  totalFrames: number
  tileWidth: number
  tileHeight: number
}

async function start() {
  console.log("Worker (preview) starting...")
  await initDatabase()
  const ch = await connectRabbitMQ()

  await ch.prefetch(1)

  registerConsumer<SeekingPreviewJob, PreviewResult>(ch, {
    queue: QUEUE.SEEKING_PREVIEW,
    label: "seeking-preview",
    maxRetries: MAX_RETRIES,
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
  console.log("\nWorker (preview) shutting down...")
  await closeRabbitMQ()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

start()
