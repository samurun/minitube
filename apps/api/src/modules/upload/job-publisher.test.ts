import { describe, it, expect, mock, beforeEach } from "bun:test"

interface PublishedJob {
  queue: string
  job: { videoId: number; rawPath: string; attempt: number }
}

const publishCalls: PublishedJob[] = []

mock.module("@workspace/shared/rabbitmq", () => ({
  publishJob: (queue: string, job: PublishedJob["job"]) => {
    publishCalls.push({ queue, job })
  },
  QUEUE: {
    THUMBNAIL: "video.thumbnail",
    SEEKING_PREVIEW: "video.seeking-preview",
    TRANSCODE: "video.transcode",
  },
  // Surface the rest of the re-export contract so module eval doesn't fail.
  connectRabbitMQ: () => Promise.resolve(),
  closeRabbitMQ: () => Promise.resolve(),
  getChannel: () => ({}),
}))

const { uploadJobPublisher } = await import("./job-publisher")

beforeEach(() => {
  publishCalls.length = 0
})

describe("uploadJobPublisher.publishIngestJobs", () => {
  it("publishes exactly one job to each ingest queue", () => {
    uploadJobPublisher.publishIngestJobs(42, "raw/my-video.mp4")

    expect(publishCalls).toHaveLength(3)
    const queues = publishCalls.map((c) => c.queue).sort()
    expect(queues).toEqual([
      "video.seeking-preview",
      "video.thumbnail",
      "video.transcode",
    ])
  })

  it("stamps every job with the same videoId + rawPath and attempt=0", () => {
    uploadJobPublisher.publishIngestJobs(7, "raw/foo.mp4")

    for (const { job } of publishCalls) {
      expect(job.videoId).toBe(7)
      expect(job.rawPath).toBe("raw/foo.mp4")
      expect(job.attempt).toBe(0)
    }
  })

  it("does not share a single job object between queues", () => {
    uploadJobPublisher.publishIngestJobs(1, "raw/a.mp4")
    const refs = publishCalls.map((c) => c.job)
    expect(new Set(refs).size).toBe(3)
  })
})
