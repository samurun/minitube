import { config } from "@workspace/shared/config"
import type { Logger } from "@workspace/shared/logger"
import { minioClient, splitStoragePath } from "@workspace/shared/storage"
import type { TranscodeJob } from "@workspace/shared/rabbitmq"
import {
  createFFmpegProgressTracker,
  probeVideo,
  runFFmpeg,
  withTempDir,
} from "@workspace/worker-core"
import { mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"
import { filterPresets, type TranscodePreset } from "./presets"

export interface TranscodeResult {
  hlsPath: string
  variants: { name: string; width: number; height: number; bitrate: number }[]
}

function buildFfmpegArgs(
  inputPath: string,
  outputDir: string,
  presets: TranscodePreset[],
  threads: number,
  segmentDuration: number
): string[] {
  const n = presets.length

  // Build filter_complex: split input video into N streams, scale each
  const splitOutputs = presets.map((_, i) => `[v${i}]`).join("")
  const scaleFilters = presets
    .map(
      (p, i) =>
        `[v${i}]scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease,pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2[v${i}out]`
    )
    .join("; ")
  const filterComplex = `[0:v]split=${n}${splitOutputs}; ${scaleFilters}`

  const args: string[] = [
    "ffmpeg",
    "-threads",
    String(threads),
    "-y",
    "-i",
    inputPath,
    "-filter_complex",
    filterComplex,
  ]

  // Map each video stream with encoding settings
  for (let i = 0; i < n; i++) {
    const p = presets[i]
    args.push(
      "-map",
      `[v${i}out]`,
      `-c:v:${i}`,
      "libx264",
      `-b:v:${i}`,
      p.videoBitrate,
      `-maxrate:v:${i}`,
      p.maxrate,
      `-bufsize:v:${i}`,
      p.bufsize
    )
  }

  // Map audio for each variant
  for (let i = 0; i < n; i++) {
    args.push("-map", "a:0?")
  }

  // Audio encoding
  args.push("-c:a", "aac")
  for (let i = 0; i < n; i++) {
    args.push(`-b:a:${i}`, presets[i].audioBitrate)
  }

  // x264 settings for aligned keyframes across variants
  args.push(
    "-preset",
    "fast",
    "-sc_threshold",
    "0",
    "-g",
    "48",
    "-keyint_min",
    "48"
  )

  // HLS output settings
  const varStreamMap = presets
    .map((p, i) => `v:${i},a:${i},name:${p.name}`)
    .join(" ")

  args.push(
    "-f",
    "hls",
    "-hls_time",
    String(segmentDuration),
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    join(outputDir, "%v", "segment_%04d.ts"),
    "-var_stream_map",
    varStreamMap,
    "-master_pl_name",
    "master.m3u8",
    join(outputDir, "%v", "playlist.m3u8")
  )

  return args
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)))
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

async function uploadDirectory(
  localDir: string,
  minioPrefix: string
): Promise<void> {
  const files = await collectFiles(localDir)

  const uploadFile = async (fullPath: string) => {
    const relativePath = fullPath.slice(localDir.length + 1)
    const objectKey = `${minioPrefix}/${relativePath}`

    const contentType = fullPath.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : fullPath.endsWith(".ts")
        ? "video/MP2T"
        : "application/octet-stream"

    const file = Bun.file(fullPath)
    const buffer = Buffer.from(await file.arrayBuffer())
    await minioClient.putObject("processed", objectKey, buffer, buffer.length, {
      "content-type": contentType,
    })
  }

  // Upload in batches of 10 to avoid overwhelming MinIO
  const batchSize = 10
  for (let i = 0; i < files.length; i += batchSize) {
    await Promise.all(files.slice(i, i + batchSize).map(uploadFile))
  }
}

export async function handleTranscode(
  job: TranscodeJob,
  ctx: { logger: Logger }
): Promise<TranscodeResult> {
  const { videoId, rawPath } = job
  const { bucket, objectName } = splitStoragePath(rawPath)
  const threads = config.transcode.ffmpegThreads
  const segmentDuration = config.transcode.hlsSegmentDuration
  const { logger } = ctx

  return withTempDir(`transcode-${videoId}`, async (dir) => {
    const tmpInput = join(dir, "input.mp4")
    const tmpOutputDir = join(dir, "out")

    logger.info("download:start")
    await minioClient.fGetObject(bucket, objectName, tmpInput)

    const { duration, width: srcW, height: srcH } = await probeVideo(tmpInput)
    const presets = filterPresets(srcW, srcH)
    logger.info("probe:done", {
      srcW,
      srcH,
      duration,
      variants: presets.map((p) => p.name),
    })

    await mkdir(tmpOutputDir, { recursive: true })
    for (const preset of presets) {
      await mkdir(join(tmpOutputDir, preset.name), { recursive: true })
    }

    const args = buildFfmpegArgs(
      tmpInput,
      tmpOutputDir,
      presets,
      threads,
      segmentDuration
    )

    const progress = createFFmpegProgressTracker(duration, logger, {
      stage: "transcode",
    })
    logger.info("ffmpeg:start", { presets: presets.length, threads })
    await runFFmpeg({
      args,
      label: "transcode",
      videoId,
      progress,
    })
    logger.info("ffmpeg:done")

    logger.info("upload:start")
    const hlsPrefix = `hls/${videoId}`
    await uploadDirectory(tmpOutputDir, hlsPrefix)
    logger.info("upload:done")

    const hlsPath = `processed/${hlsPrefix}/master.m3u8`
    const variants = presets.map((p) => ({
      name: p.name,
      width: p.width,
      height: p.height,
      bitrate: parseInt(p.videoBitrate) * 1000,
    }))

    return { hlsPath, variants }
  })
}
