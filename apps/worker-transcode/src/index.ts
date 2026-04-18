import {
  QUEUE,
  type TranscodeJob,
} from "@workspace/shared/rabbitmq"
import { startWorker, updateVideoField } from "@workspace/worker-core"
import { handleTranscode, type TranscodeResult } from "./handler"

await startWorker<TranscodeJob, TranscodeResult>({
  queue: QUEUE.TRANSCODE,
  label: "transcode",
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
