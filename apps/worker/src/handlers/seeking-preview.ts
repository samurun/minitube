import { minioClient } from "@workspace/shared/storage"
import { splitStoragePath } from "@workspace/shared/storage"
import type { SeekingPreviewJob } from "@workspace/shared/rabbitmq"
import { unlink } from "node:fs/promises"

interface VideoMeta {
  duration: number
  width: number
  height: number
}

async function probeVideo(filePath: string): Promise<VideoMeta> {
  const proc = Bun.spawn([
    "ffprobe",
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "csv=p=0",
    filePath,
  ])
  const output = await new Response(proc.stdout).text()
  await proc.exited
  // csv format outputs two lines: "width,height" then "duration"
  const lines = output.trim().split("\n")
  const [w, h] = (lines[0] ?? "").split(",").map(Number)
  const duration = parseFloat(lines[1] ?? "")
  if (!w || !h || isNaN(duration) || duration <= 0) {
    throw new Error(`Could not probe video metadata`)
  }
  return { duration, width: w, height: h }
}

// Pick a frame interval based on video duration so sprite sheet size stays
// reasonable for long videos while short clips keep fine-grained previews.
function pickInterval(duration: number, minInterval: number): number {
  const tiers: [number, number][] = [
    [600, 1], // < 10m
    [1200, 2], // < 20m
    [1800, 3], // < 30m
    [2400, 5], // < 40m
    [3600, 10], // < 60m
    [Infinity, 10], // >= 60m
  ]
  const tier = tiers.find(([max]) => duration < max)!
  return Math.max(minInterval, tier[1])
}

export async function handleSeekingPreview(job: SeekingPreviewJob) {
  const { videoId, rawPath, columnsPerRow, tileWidth: maxTileWidth } = job
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

    // 2. Probe video for duration + dimensions. Compute tile size from the
    //    source aspect ratio so the sprite preview matches real video shape
    //    (instead of being stretched to a hardcoded 16:9 box).
    const { duration, width: srcW, height: srcH } = await probeVideo(tmpInput)
    const interval = pickInterval(duration, minInterval)
    const totalFrames = Math.max(1, Math.ceil(duration / interval))
    const rows = Math.max(1, Math.ceil(totalFrames / columnsPerRow))

    // Keep tile width fixed at the configured max, derive height from source
    // aspect ratio. Round to even numbers (libx264/jpeg-friendly).
    const tileWidth = maxTileWidth
    const rawTileHeight = Math.round((tileWidth * srcH) / srcW)
    const tileHeight = rawTileHeight % 2 === 0 ? rawTileHeight : rawTileHeight + 1

    log(
      "ffprobe:done",
      `duration=${duration.toFixed(1)}s ${srcW}x${srcH} interval=${interval}s tile=${tileWidth}x${tileHeight} grid=${columnsPerRow}x${rows}`
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
        "10",
        tmpOutput,
      ],
      { stdout: "pipe", stderr: "pipe" }
    )

    // Parse stderr for `time=HH:MM:SS.xx` (input decode position).
    // We can't use stdout `-progress out_time_ms` because the tile filter
    // produces only one output frame, so out_time stays at 0 the whole run.
    let stderrTail = ""
    ;(async () => {
      const reader = proc.stderr.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let lastLogged = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        stderrTail = (stderrTail + chunk).slice(-2000)
        // ffmpeg uses \r to overwrite the stats line
        buf += chunk.replace(/\r/g, "\n")
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          const m = line.match(/time=(\d+):(\d{2}):(\d{2})\.(\d+)/)
          if (m) {
            const seconds =
              Number(m[1]) * 3600 +
              Number(m[2]) * 60 +
              Number(m[3]) +
              Number(`0.${m[4]}`)
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
      throw new Error(
        `FFmpeg sprite sheet failed (exit ${proc.exitCode}): ${stderrTail.slice(-500)}`
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

    return {
      path: `processed/${outputKey}`,
      interval,
      columns: columnsPerRow,
      totalFrames,
      tileWidth,
      tileHeight,
    }
  } finally {
    await unlink(tmpInput).catch(() => {})
    await unlink(tmpOutput).catch(() => {})
  }
}
