import { config } from "@workspace/shared/config"
import { minioClient } from "@workspace/shared/storage"
import { splitStoragePath } from "@workspace/shared/storage"
import type { SeekingPreviewJob } from "@workspace/shared/rabbitmq"
import { probeVideo } from "@workspace/worker-core"
import { mkdir, readdir, rm, unlink } from "node:fs/promises"

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

const COLUMNS_PER_ROW = 10
const TILE_WIDTH = 160
const MIN_INTERVAL_SEC = 1
const JPEG_QUALITY = 10

export async function handleSeekingPreview(job: SeekingPreviewJob) {
  const { videoId, rawPath } = job
  const { bucket, objectName } = splitStoragePath(rawPath)
  const columnsPerRow = COLUMNS_PER_ROW
  const maxTileWidth = TILE_WIDTH
  const threads = String(config.worker.ffmpegThreads)
  const quality = String(JPEG_QUALITY)

  const stamp = Date.now()
  const tmpInput = `/tmp/preview-in-${videoId}-${stamp}.mp4`
  const tmpFramesDir = `/tmp/preview-frames-${videoId}-${stamp}`
  const tmpOutput = `/tmp/preview-out-${videoId}-${stamp}.jpg`

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
    const interval = pickInterval(duration, MIN_INTERVAL_SEC)
    const totalFrames = Math.max(1, Math.ceil(duration / interval))
    const rows = Math.max(1, Math.ceil(totalFrames / columnsPerRow))

    // Keep tile width fixed at the configured max, derive height from source
    // aspect ratio. Round to even numbers (libx264/jpeg-friendly).
    const tileWidth = maxTileWidth
    const rawTileHeight = Math.round((tileWidth * srcH) / srcW)
    const tileHeight =
      rawTileHeight % 2 === 0 ? rawTileHeight : rawTileHeight + 1

    log(
      "ffprobe:done",
      `duration=${duration.toFixed(1)}s ${srcW}x${srcH} interval=${interval}s tile=${tileWidth}x${tileHeight} grid=${columnsPerRow}x${rows}`
    )

    // 3. Two-pass sprite generation:
    //    Pass 1 extracts one scaled frame per `interval` seconds into a temp
    //    directory. We poll the directory while ffmpeg runs and log progress
    //    from file count — this is independent of ffmpeg's stderr buffering
    //    (which behaves differently with the tile filter and gives no useful
    //    progress signal).
    //    Pass 2 stitches the extracted frames into the sprite sheet. It's
    //    near-instant so it needs no progress reporting.
    await mkdir(tmpFramesDir, { recursive: true })

    log("ffmpeg:start", `pass=extract frames=${totalFrames}`)
    const pass1 = Bun.spawn(
      [
        "ffmpeg",
        "-threads",
        threads,
        "-y",
        "-i",
        tmpInput,
        "-vf",
        `fps=1/${interval},scale=${tileWidth}:${tileHeight}`,
        "-q:v",
        quality,
        `${tmpFramesDir}/f%04d.jpg`,
      ],
      { stdout: "pipe", stderr: "pipe" }
    )

    // Poll the frames directory while ffmpeg runs. Only log when the frame
    // count actually advances so we never print the same number twice.
    let lastCount = -1
    const poll = setInterval(async () => {
      try {
        const files = await readdir(tmpFramesDir)
        const n = files.length
        if (n === lastCount) return
        lastCount = n
        const pct = Math.min(100, (n / totalFrames) * 100)
        log(
          "ffmpeg:progress",
          `${pct.toFixed(0)}% (${n}/${totalFrames} frames) ${elapsed()}`
        )
      } catch {
        // dir might briefly not exist between mkdir and first write
      }
    }, 500)

    const pass1StderrTail = new Response(pass1.stderr).text()
    await pass1.exited
    clearInterval(poll)
    if (pass1.exitCode !== 0) {
      const tail = (await pass1StderrTail).slice(-500)
      throw new Error(`FFmpeg pass1 failed (exit ${pass1.exitCode}): ${tail}`)
    }
    log("ffmpeg:pass1:done", elapsed())

    // Pass 2: tile the extracted frames. Fast — no progress needed.
    const pass2 = Bun.spawn(
      [
        "ffmpeg",
        "-threads",
        threads,
        "-y",
        "-framerate",
        "1",
        "-i",
        `${tmpFramesDir}/f%04d.jpg`,
        "-vf",
        `tile=${columnsPerRow}x${rows}`,
        "-frames:v",
        "1",
        "-q:v",
        quality,
        tmpOutput,
      ],
      { stdout: "pipe", stderr: "pipe" }
    )
    const pass2StderrTail = new Response(pass2.stderr).text()
    await pass2.exited
    if (pass2.exitCode !== 0) {
      const tail = (await pass2StderrTail).slice(-500)
      throw new Error(`FFmpeg pass2 failed (exit ${pass2.exitCode}): ${tail}`)
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
      duration,
      interval,
      columns: columnsPerRow,
      totalFrames,
      tileWidth,
      tileHeight,
    }
  } finally {
    await unlink(tmpInput).catch(() => {})
    await unlink(tmpOutput).catch(() => {})
    await rm(tmpFramesDir, { recursive: true, force: true }).catch(() => {})
  }
}
