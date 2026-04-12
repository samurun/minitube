import { config } from "@workspace/shared/config"
import { minioClient } from "@workspace/shared/storage"
import { splitStoragePath } from "@workspace/shared/storage"
import type { ThumbnailJob } from "@workspace/shared/rabbitmq"
import { probeDuration, runFFmpeg } from "@workspace/worker-core"
import { unlink } from "node:fs/promises"

export async function handleThumbnail(job: ThumbnailJob) {
  const { videoId, rawPath } = job
  const { bucket, objectName } = splitStoragePath(rawPath)
  const { ffmpegThreads } = config.worker
  const { timestampSec, quality } = config.thumbnail

  const tmpInput = `/tmp/thumb-in-${videoId}-${Date.now()}.mp4`
  const tmpOutput = `/tmp/thumb-out-${videoId}-${Date.now()}.jpg`

  try {
    // 1. Download raw video
    await minioClient.fGetObject(bucket, objectName, tmpInput)

    // 2. Probe duration
    const duration = await probeDuration(tmpInput)

    // 3. Extract single frame
    await runFFmpeg({
      args: [
        "ffmpeg",
        "-threads",
        String(ffmpegThreads),
        "-y",
        "-ss",
        String(timestampSec),
        "-i",
        tmpInput,
        "-frames:v",
        "1",
        "-q:v",
        String(quality),
        tmpOutput,
      ],
      label: "thumbnail",
      videoId,
    })

    // 4. Upload to processed bucket
    const outputKey = `thumbnails/${videoId}.jpg`
    const file = Bun.file(tmpOutput)
    const buffer = Buffer.from(await file.arrayBuffer())
    await minioClient.putObject("processed", outputKey, buffer, buffer.length)

    return { path: `processed/${outputKey}`, duration }
  } finally {
    await unlink(tmpInput).catch(() => {})
    await unlink(tmpOutput).catch(() => {})
  }
}
