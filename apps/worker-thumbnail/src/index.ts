import { config } from "@workspace/shared/config"
import { initDatabase } from "@workspace/shared/database"
import {
  connectRabbitMQ,
  closeRabbitMQ,
  QUEUE,
  type ThumbnailJob,
} from "@workspace/shared/rabbitmq"
import {
  registerConsumer,
  updateVideoField,
  type ConsumerHandle,
} from "@workspace/worker-core"
import { handleThumbnail } from "./handler"

let consumer: ConsumerHandle

async function start() {
  console.log("Worker (thumbnail) starting...")
  await initDatabase()
  const ch = await connectRabbitMQ()

  await ch.prefetch(1)

  consumer = registerConsumer<
    ThumbnailJob,
    { path: string; duration: number | null }
  >(ch, {
    queue: QUEUE.THUMBNAIL,
    label: "thumbnail",
    maxRetries: config.worker.maxRetries,
    handle: handleThumbnail,
    onSuccess: async (job, result) => {
      await updateVideoField(job.videoId, {
        thumbnailPath: result.path,
        thumbnailErrorMessage: null,
        duration: result.duration,
      })
    },
    onFailed: async (job, errMsg) => {
      await updateVideoField(job.videoId, {
        thumbnailErrorMessage: errMsg,
      })
    },
  })

  console.log("Worker (thumbnail) ready — waiting for jobs")
}

const shutdown = async () => {
  console.log("\nWorker (thumbnail) shutting down — draining in-flight job...")
  await consumer?.drain()
  await closeRabbitMQ()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
process.on("uncaughtException", (err) => {
  console.error("[thumbnail] uncaughtException:", err)
})
process.on("unhandledRejection", (err) => {
  console.error("[thumbnail] unhandledRejection:", err)
})

start()
