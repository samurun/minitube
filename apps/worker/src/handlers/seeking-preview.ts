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
  const { videoId, rawPath, columnsPerRow, tileWidth, tileHeight } = job
  // Hard cap total tiles so sprite sheet size stays reasonable regardless of
  // video length. Short clips still get fine-grained previews (floor = job
  // interval), long clips automatically use a larger interval.
  const MAX_TILES = 1200
  const minInterval = job.frameIntervalSeconds
  const { bucket, objectName } = splitStoragePath(rawPath)

  const tmpInput = `/tmp/preview-in-${videoId}-${Date.now()}.mp4`
  const tmpOutput = `/tmp/preview-out-${videoId}-${Date.now()}.jpg`

  const log = (stage: string, extra = "") =>
    console.log(
      `[seeking-preview] video:${videoId} ${stage}${extra ? " " + extra : ""}`
    )
  const t0 = Date.now()
  const elapsed = () => `(${((Date.now() - t0) / 1000).toFixed(1)}s)`

  try {
    // 1. Download raw video
    log("download:start")
    await minioClient.fGetObject(bucket, objectName, tmpInput)
    log("download:done", elapsed())

    // 2. Get video duration, then pick an interval that keeps total tiles
    //    under MAX_TILES (so sprite sheet size stays reasonable for long clips)
    const duration = await getVideoDuration(tmpInput)
    const interval = Math.max(minInterval, Math.ceil(duration / MAX_TILES))
    const totalFrames = Math.max(1, Math.ceil(duration / interval))
    const rows = Math.max(1, Math.ceil(totalFrames / columnsPerRow))
    log(
      "ffprobe:done",
      `duration=${duration.toFixed(1)}s interval=${interval}s tiles=${columnsPerRow}x${rows}`
    )

    // 3. Generate sprite sheet
    log("ffmpeg:start")
    const vf = `fps=1/${interval},scale=${tileWidth}:${tileHeight},tile=${columnsPerRow}x${rows}`
    const proc = Bun.spawn(
      [
        "ffmpeg",
        "-y",
        "-i",
        tmpInput,
        "-vf",
        vf,
        "-q:v",
        "5",
        "-progress",
        "pipe:1",
        "-nostats",
        tmpOutput,
      ],
      { stdout: "pipe", stderr: "pipe" }
    )

    // Stream ffmpeg progress: out_time_ms=... → log % every ~5s
    ;(async () => {
      const reader = proc.stdout.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let lastLogged = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value)
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          const m = line.match(/^out_time_ms=(\d+)/)
          if (m) {
            const seconds = Number(m[1]) / 1_000_000
            const pct = Math.min(100, (seconds / duration) * 100)
            const now = Date.now()
            if (now - lastLogged > 5000) {
              log(
                "ffmpeg:progress",
                `${pct.toFixed(1)}% (${seconds.toFixed(0)}/${duration.toFixed(0)}s) ${elapsed()}`
              )
              lastLogged = now
            }
          }
        }
      }
    })()

    await proc.exited
    if (proc.exitCode !== 0) {
      const errText = await new Response(proc.stderr).text()
      throw new Error(
        `FFmpeg sprite sheet failed (exit ${proc.exitCode}): ${errText.slice(-500)}`
      )
    }
    log("ffmpeg:done", elapsed())

    // 4. Upload to processed bucket
    log("upload:start")
    const outputKey = `seeking-previews/${videoId}.jpg`
    const file = Bun.file(tmpOutput)
    const buffer = Buffer.from(await file.arrayBuffer())
    await minioClient.putObject("processed", outputKey, buffer, buffer.length)
    log("upload:done", elapsed())

    return `processed/${outputKey}`
  } finally {
    await unlink(tmpInput).catch(() => {})
    await unlink(tmpOutput).catch(() => {})
  }
}
