import { config } from "@workspace/shared/config"
import type { Logger } from "@workspace/shared/logger"
import {
  minioClient,
  splitStoragePath,
} from "@workspace/shared/storage"
import type { ThumbnailJob } from "@workspace/shared/rabbitmq"
import {
  probeDuration,
  runFFmpeg,
  withTempDir,
} from "@workspace/worker-core"
import { join } from "node:path"

export async function handleThumbnail(
  job: ThumbnailJob,
  ctx: { logger: Logger }
) {
  const { videoId, rawPath } = job
  const { bucket, objectName } = splitStoragePath(rawPath)
  const { ffmpegThreads } = config.worker
  const { timestampSec, quality } = config.thumbnail

  return withTempDir(`thumb-${videoId}`, async (dir) => {
    const tmpInput = join(dir, "input.mp4")
    const tmpOutput = join(dir, "output.jpg")

    ctx.logger.info("download:start")
    await minioClient.fGetObject(bucket, objectName, tmpInput)

    const duration = await probeDuration(tmpInput)

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

    const outputKey = `thumbnails/${videoId}.jpg`
    const file = Bun.file(tmpOutput)
    const buffer = Buffer.from(await file.arrayBuffer())
    await minioClient.putObject("processed", outputKey, buffer, buffer.length)

    return { path: `processed/${outputKey}`, duration }
  })
}
