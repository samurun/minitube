import { publishJob, QUEUE } from "@workspace/shared/rabbitmq"

const INGEST_QUEUES = [
  QUEUE.THUMBNAIL,
  QUEUE.SEEKING_PREVIEW,
  QUEUE.TRANSCODE,
] as const

export const uploadJobPublisher = {
  publishIngestJobs: (videoId: number, rawPath: string) => {
    for (const queue of INGEST_QUEUES) {
      publishJob(queue, { videoId, rawPath, attempt: 0 })
    }
  },
}
