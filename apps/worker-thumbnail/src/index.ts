import {
  QUEUE,
  type ThumbnailJob,
} from "@workspace/shared/rabbitmq"
import { startWorker, updateVideoField } from "@workspace/worker-core"
import { handleThumbnail } from "./handler"

await startWorker<ThumbnailJob, { path: string; duration: number | null }>({
  queue: QUEUE.THUMBNAIL,
  label: "thumbnail",
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
