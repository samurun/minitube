import { config } from "@workspace/shared/config"
import type { Logger } from "@workspace/shared/logger"
import {
  minioClient,
  splitStoragePath,
} from "@workspace/shared/storage"
import type { SeekingPreviewJob } from "@workspace/shared/rabbitmq"
import { probeVideo, withTempDir } from "@workspace/worker-core"
import { mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"

export interface PreviewResult {
  path: string
  duration: number
  interval: number
  columns: number
  totalFrames: number
  tileWidth: number
  tileHeight: number
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

const COLUMNS_PER_ROW = 10
const TILE_WIDTH = 160
const MIN_INTERVAL_SEC = 1
const JPEG_QUALITY = 10

export async function handleSeekingPreview(
  job: SeekingPreviewJob,
  ctx: { logger: Logger }
): Promise<PreviewResult> {
  const { videoId, rawPath } = job
  const { bucket, objectName } = splitStoragePath(rawPath)
  const threads = String(config.worker.ffmpegThreads)
  const quality = String(JPEG_QUALITY)
  const { logger } = ctx

  return withTempDir(`preview-${videoId}`, async (dir) => {
    const tmpInput = join(dir, "input.mp4")
    const tmpFramesDir = join(dir, "frames")
    const tmpOutput = join(dir, "output.jpg")

    logger.info("download:start")
    await minioClient.fGetObject(bucket, objectName, tmpInput)

    // Probe video for duration + dimensions. Compute tile size from the
    // source aspect ratio so the sprite preview matches real video shape
    // (instead of being stretched to a hardcoded 16:9 box).
    const { duration, width: srcW, height: srcH } = await probeVideo(tmpInput)
    const interval = pickInterval(duration, MIN_INTERVAL_SEC)
    const totalFrames = Math.max(1, Math.ceil(duration / interval))
    const rows = Math.max(1, Math.ceil(totalFrames / COLUMNS_PER_ROW))

    // Keep tile width fixed at the configured max, derive height from source
    // aspect ratio. Round to even numbers (libx264/jpeg-friendly).
    const tileWidth = TILE_WIDTH
    const rawTileHeight = Math.round((tileWidth * srcH) / srcW)
    const tileHeight =
      rawTileHeight % 2 === 0 ? rawTileHeight : rawTileHeight + 1

    logger.info("ffprobe:done", {
      duration,
      srcW,
      srcH,
      interval,
      tileWidth,
      tileHeight,
      columns: COLUMNS_PER_ROW,
      rows,
    })

    // Two-pass sprite generation:
    //  Pass 1 extracts one scaled frame per `interval` seconds into a temp
    //  directory. We poll the directory while ffmpeg runs and log progress
    //  from file count — this is independent of ffmpeg's stderr buffering.
    //  Pass 2 stitches the extracted frames into the sprite sheet. It's
    //  near-instant so it needs no progress reporting.
    await mkdir(tmpFramesDir, { recursive: true })

    logger.info("ffmpeg:pass1:start", { totalFrames })
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
        join(tmpFramesDir, "f%04d.jpg"),
      ],
      { stdout: "pipe", stderr: "pipe" }
    )

    // Poll frames dir while ffmpeg runs. Only log when count advances.
    let lastCount = -1
    const poll = setInterval(async () => {
      try {
        const files = await readdir(tmpFramesDir)
        const n = files.length
        if (n === lastCount) return
        lastCount = n
        const pct = Math.min(100, (n / totalFrames) * 100)
        logger.info("ffmpeg:pass1:progress", {
          pct: Math.round(pct),
          n,
          totalFrames,
        })
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
    logger.info("ffmpeg:pass1:done")

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
        join(tmpFramesDir, "f%04d.jpg"),
        "-vf",
        `tile=${COLUMNS_PER_ROW}x${rows}`,
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
    logger.info("ffmpeg:pass2:done")

    const outputKey = `seeking-previews/${videoId}.jpg`
    const file = Bun.file(tmpOutput)
    const buffer = Buffer.from(await file.arrayBuffer())
    await minioClient.putObject("processed", outputKey, buffer, buffer.length)
    logger.info("upload:done")

    return {
      path: `processed/${outputKey}`,
      duration,
      interval,
      columns: COLUMNS_PER_ROW,
      totalFrames,
      tileWidth,
      tileHeight,
    }
  })
}
