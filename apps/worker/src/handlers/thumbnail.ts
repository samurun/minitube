import { minioClient } from "@workspace/shared/storage"
import { splitStoragePath } from "@workspace/shared/storage"
import type { ThumbnailJob } from "@workspace/shared/rabbitmq"
import { unlink } from "node:fs/promises"

export async function handleThumbnail(job: ThumbnailJob) {
  const { videoId, rawPath } = job
  const { bucket, objectName } = splitStoragePath(rawPath)

  const tmpInput = `/tmp/thumb-in-${videoId}-${Date.now()}.mp4`
  const tmpOutput = `/tmp/thumb-out-${videoId}-${Date.now()}.jpg`

  try {
    // 1. Download raw video
    await minioClient.fGetObject(bucket, objectName, tmpInput)

    // 2. Extract single frame at 1s
    const proc = Bun.spawn([
      "ffmpeg",
      "-y",
      "-ss",
      "1",
      "-i",
      tmpInput,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      tmpOutput,
    ])
    await proc.exited
    if (proc.exitCode !== 0) {
      throw new Error(`FFmpeg thumbnail failed (exit ${proc.exitCode})`)
    }

    // 3. Upload to processed bucket
    const outputKey = `thumbnails/${videoId}.jpg`
    const file = Bun.file(tmpOutput)
    const buffer = Buffer.from(await file.arrayBuffer())
    await minioClient.putObject("processed", outputKey, buffer, buffer.length)

    return `processed/${outputKey}`
  } finally {
    await unlink(tmpInput).catch(() => {})
    await unlink(tmpOutput).catch(() => {})
  }
}
