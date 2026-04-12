import { config } from "@workspace/shared/config"
import { minioClient, splitStoragePath } from "@workspace/shared/storage"
import type { TranscodeJob } from "@workspace/shared/rabbitmq"
import { mkdir, readdir, rm, unlink } from "node:fs/promises"
import { join } from "node:path"
import { filterPresets, type TranscodePreset } from "./presets"

interface VideoMeta {
  duration: number
  width: number
  height: number
}

export interface TranscodeResult {
  hlsPath: string
  variants: { name: string; width: number; height: number; bitrate: number }[]
}

async function probeVideo(filePath: string): Promise<VideoMeta> {
  const proc = Bun.spawn(
    [
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
    ],
    { stdout: "pipe", stderr: "pipe" }
  )
  const output = await new Response(proc.stdout).text()
  await proc.exited
  const lines = output.trim().split("\n")
  const [w, h] = (lines[0] ?? "").split(",").map(Number)
  const duration = parseFloat(lines[1] ?? "")
  if (!w || !h || isNaN(duration) || duration <= 0) {
    throw new Error("Could not probe video metadata")
  }
  return { duration, width: w, height: h }
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
  job: TranscodeJob
): Promise<TranscodeResult> {
  const { videoId, rawPath } = job
  const { bucket, objectName } = splitStoragePath(rawPath)
  const threads = config.transcode.ffmpegThreads
  const segmentDuration = config.transcode.hlsSegmentDuration

  const stamp = Date.now()
  const tmpInput = `/tmp/transcode-in-${videoId}-${stamp}.mp4`
  const tmpOutputDir = `/tmp/transcode-out-${videoId}-${stamp}`

  const log = (stage: string, extra = "") =>
    console.log(
      `[transcode] video:${videoId} ${stage}${extra ? " " + extra : ""}`
    )
  const t0 = Date.now()
  const elapsed = () => `(${((Date.now() - t0) / 1000).toFixed(1)}s)`

  try {
    // 1. Download raw video
    log("download:start")
    await minioClient.fGetObject(bucket, objectName, tmpInput)
    log("download:done", elapsed())

    // 2. Probe source resolution
    const { duration, width: srcW, height: srcH } = await probeVideo(tmpInput)
    const presets = filterPresets(srcW, srcH)
    log(
      "probe:done",
      `${srcW}x${srcH} duration=${duration.toFixed(1)}s variants=${presets.map((p) => p.name).join(",")}`
    )

    // 3. Create output directories for each variant
    await mkdir(tmpOutputDir, { recursive: true })
    for (const preset of presets) {
      await mkdir(join(tmpOutputDir, preset.name), { recursive: true })
    }

    // 4. Run FFmpeg single-pass multi-variant HLS
    const args = buildFfmpegArgs(
      tmpInput,
      tmpOutputDir,
      presets,
      threads,
      segmentDuration
    )

    log("ffmpeg:start", `presets=${presets.length} threads=${threads}`)
    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })

    // Parse progress from FFmpeg stderr
    const stderrReader = proc.stderr.getReader()
    let stderrBuffer = ""
    const readProgress = (async () => {
      const decoder = new TextDecoder()
      let lastPct = -1
      while (true) {
        const { done, value } = await stderrReader.read()
        if (done) break
        stderrBuffer += decoder.decode(value, { stream: true })

        // Parse time=HH:MM:SS.ms from stderr
        const timeMatch = stderrBuffer.match(/time=(\d+):(\d+):(\d+\.\d+)/g)
        if (timeMatch) {
          const last = timeMatch[timeMatch.length - 1]
          const m = last.match(/time=(\d+):(\d+):(\d+\.\d+)/)
          if (m) {
            const secs =
              parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
            const pct = Math.min(100, Math.round((secs / duration) * 100))
            if (pct > lastPct) {
              lastPct = pct
              log("ffmpeg:progress", `${pct}% ${elapsed()}`)
            }
          }
        }

        // Keep buffer from growing unbounded
        if (stderrBuffer.length > 4096) {
          stderrBuffer = stderrBuffer.slice(-2048)
        }
      }
    })()

    await proc.exited
    await readProgress
    if (proc.exitCode !== 0) {
      const tail = stderrBuffer.slice(-500)
      throw new Error(`FFmpeg transcode failed (exit ${proc.exitCode}): ${tail}`)
    }
    log("ffmpeg:done", elapsed())

    // 5. Upload HLS output to MinIO
    log("upload:start")
    const hlsPrefix = `hls/${videoId}`
    await uploadDirectory(tmpOutputDir, hlsPrefix)
    log("upload:done", elapsed())

    const hlsPath = `processed/${hlsPrefix}/master.m3u8`
    const variants = presets.map((p) => ({
      name: p.name,
      width: p.width,
      height: p.height,
      bitrate: parseInt(p.videoBitrate) * 1000,
    }))

    return { hlsPath, variants }
  } finally {
    await unlink(tmpInput).catch(() => {})
    await rm(tmpOutputDir, { recursive: true, force: true }).catch(() => {})
  }
}
