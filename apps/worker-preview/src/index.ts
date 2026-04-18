import {
  QUEUE,
  type SeekingPreviewJob,
} from "@workspace/shared/rabbitmq"
import { startWorker, updateVideoField } from "@workspace/worker-core"
import { handleSeekingPreview, type PreviewResult } from "./handler"

await startWorker<SeekingPreviewJob, PreviewResult>({
  queue: QUEUE.SEEKING_PREVIEW,
  label: "seeking-preview",
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
