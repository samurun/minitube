import { minioClient } from "@workspace/shared/storage"
import { splitStoragePath } from "@workspace/shared/storage"
import type { SeekingPreviewJob } from "@workspace/shared/rabbitmq"
import { unlink } from "node:fs/promises"

async function getVideoDuration(filePath: string): Promise<number> {
  const proc = Bun.spawn([
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    filePath,
  ])
  const output = await new Response(proc.stdout).text()
  await proc.exited
  const duration = parseFloat(output.trim())
  if (isNaN(duration) || duration <= 0) {
    throw new Error(`Could not determine video duration`)
  }
  return duration
}

export async function handleSeekingPreview(job: SeekingPreviewJob) {
  const { videoId, rawPath, frameIntervalSeconds, columnsPerRow, tileWidth, tileHeight } = job
  const { bucket, objectName } = splitStoragePath(rawPath)

  const tmpInput = `/tmp/preview-in-${videoId}-${Date.now()}.mp4`
  const tmpOutput = `/tmp/preview-out-${videoId}-${Date.now()}.jpg`

  try {
    // 1. Download raw video
    await minioClient.fGetObject(bucket, objectName, tmpInput)

    // 2. Get video duration and calculate tile rows
    const duration = await getVideoDuration(tmpInput)
    const totalFrames = Math.max(1, Math.ceil(duration / frameIntervalSeconds))
    const rows = Math.max(1, Math.ceil(totalFrames / columnsPerRow))

    // 3. Generate sprite sheet
    const vf = `fps=1/${frameIntervalSeconds},scale=${tileWidth}:${tileHeight},tile=${columnsPerRow}x${rows}`
    const proc = Bun.spawn([
      "ffmpeg",
      "-y",
      "-i",
      tmpInput,
      "-vf",
      vf,
      "-q:v",
      "5",
      tmpOutput,
    ])
    await proc.exited
    if (proc.exitCode !== 0) {
      throw new Error(`FFmpeg sprite sheet failed (exit ${proc.exitCode})`)
    }

    // 3. Upload to processed bucket
    const outputKey = `seeking-previews/${videoId}.jpg`
    const file = Bun.file(tmpOutput)
    const buffer = Buffer.from(await file.arrayBuffer())
    await minioClient.putObject("processed", outputKey, buffer, buffer.length)

    return `processed/${outputKey}`
  } finally {
    await unlink(tmpInput).catch(() => {})
    await unlink(tmpOutput).catch(() => {})
  }
}
