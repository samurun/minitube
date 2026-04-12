import { config } from "@workspace/shared/config"
import { initDatabase } from "@workspace/shared/database"
import {
  connectRabbitMQ,
  closeRabbitMQ,
  QUEUE,
  type TranscodeJob,
} from "@workspace/shared/rabbitmq"
import { registerConsumer, updateVideoField } from "@workspace/worker-core"
import { handleTranscode, type TranscodeResult } from "./handler"

async function start() {
  console.log("Worker (transcode) starting...")
  await initDatabase()
  const ch = await connectRabbitMQ()

  await ch.prefetch(1)

  registerConsumer<TranscodeJob, TranscodeResult>(ch, {
    queue: QUEUE.TRANSCODE,
    label: "transcode",
    maxRetries: config.worker.maxRetries,
    handle: handleTranscode,
    onSuccess: async (job, result) => {
      await updateVideoField(job.videoId, {
        hlsPath: result.hlsPath,
        hlsErrorMessage: null,
        hlsVariants: JSON.stringify(result.variants),
      })
    },
    onFailed: async (job, errMsg) => {
      await updateVideoField(job.videoId, {
        hlsErrorMessage: errMsg,
      })
    },
  })

  console.log("Worker (transcode) ready — waiting for jobs")
}

const shutdown = async () => {
  console.log("\nWorker (transcode) shutting down...")
  await closeRabbitMQ()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
process.on("uncaughtException", (err) => {
  console.error("[transcode] uncaughtException:", err)
})
process.on("unhandledRejection", (err) => {
  console.error("[transcode] unhandledRejection:", err)
})

start()
