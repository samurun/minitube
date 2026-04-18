import { logger } from "../../shared/logger"
import {
  HlsNotFoundError,
  InvalidHlsPathError,
  VideoNotFoundError,
} from "./errors"
import { videoRepository, type VideoRecord } from "./repository"
import { videoStorage } from "./storage"

const log = logger.child({ module: "videos.service" })

const PRESIGN_TTL_SEC = 600

interface VideoResponse {
  id: number
  title: string
  status: string
  createdAt: Date
  updatedAt: Date
  videoUrl: string | null
  duration: number | null
  thumbnailUrl: string | null
  seekingPreviewUrl: string | null
  seekingPreviewInterval: number | null
  seekingPreviewColumns: number | null
  seekingPreviewTotalFrames: number | null
  seekingPreviewTileWidth: number | null
  seekingPreviewTileHeight: number | null
  hlsUrl: string | null
  hlsVariants: object[] | null
}

async function attachVideoUrls(video: VideoRecord): Promise<VideoResponse> {
  const base = {
    id: video.id,
    title: video.title,
    status: video.status,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    duration: video.duration,
    seekingPreviewInterval: video.seekingPreviewInterval,
    seekingPreviewColumns: video.seekingPreviewColumns,
    seekingPreviewTotalFrames: video.seekingPreviewTotalFrames,
    seekingPreviewTileWidth: video.seekingPreviewTileWidth,
    seekingPreviewTileHeight: video.seekingPreviewTileHeight,
  }

  try {
    const [thumbnailUrl, seekingPreviewUrl] = await Promise.all([
      video.thumbnailPath
        ? videoStorage.presignRead(video.thumbnailPath, PRESIGN_TTL_SEC)
        : null,
      video.seekingPreviewPath
        ? videoStorage.presignRead(video.seekingPreviewPath, PRESIGN_TTL_SEC)
        : null,
    ])

    return {
      ...base,
      videoUrl: `/videos/${video.id}/stream`,
      thumbnailUrl,
      seekingPreviewUrl,
      hlsUrl: video.hlsPath ? `/videos/${video.id}/hls/master.m3u8` : null,
      hlsVariants: video.hlsVariants
        ? (JSON.parse(video.hlsVariants) as object[])
        : null,
    }
  } catch (err) {
    log.error("failed to attach video URLs", {
      videoId: video.id,
      err: err instanceof Error ? err.message : String(err),
    })
    return {
      ...base,
      videoUrl: null,
      thumbnailUrl: null,
      seekingPreviewUrl: null,
      hlsUrl: null,
      hlsVariants: null,
    }
  }
}

function parseRange(
  rangeHeader: string,
  size: number
): { start: number; end: number } | null {
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader)
  if (!match || !match[1]) return null

  const start = parseInt(match[1], 10)
  const requestedEnd = match[2] ? parseInt(match[2], 10) : size - 1
  const end = Math.min(requestedEnd, size - 1)

  if (Number.isNaN(start) || start >= size || end < start) return null
  return { start, end }
}

export const videoService = {
  getVideos: async (page = 1, pageSize = 20) => {
    const records = await videoRepository.list(page, pageSize)
    return {
      message: "Videos fetched successfully",
      videos: await Promise.all(records.map(attachVideoUrls)),
    }
  },

  getVideoById: async (id: number) => {
    const video = await videoRepository.findById(id)
    if (!video) throw new VideoNotFoundError(id)
    return {
      message: "Video fetched successfully",
      video: await attachVideoUrls(video),
    }
  },

  streamVideo: async (
    id: number,
    rangeHeader: string | null
  ): Promise<{
    body: ReadableStream
    status: 200 | 206 | 416
    headers: Record<string, string>
  }> => {
    const video = await videoRepository.findById(id)
    if (!video) throw new VideoNotFoundError(id)

    const stat = await videoStorage.statRaw(video.rawPath)
    const size = stat.size
    const contentType =
      (stat.metaData && (stat.metaData["content-type"] as string)) ||
      "video/mp4"

    if (!rangeHeader) {
      const body = await videoStorage.readRawRange(video.rawPath, 0, size)
      return {
        body,
        status: 200,
        headers: {
          "content-type": contentType,
          "content-length": String(size),
          "accept-ranges": "bytes",
          "cache-control": "no-store",
        },
      }
    }

    const range = parseRange(rangeHeader, size)
    if (!range) {
      return {
        body: new ReadableStream({ start: (c) => c.close() }),
        status: 416,
        headers: {
          "content-range": `bytes */${size}`,
          "content-type": contentType,
        },
      }
    }

    const length = range.end - range.start + 1
    const body = await videoStorage.readRawRange(
      video.rawPath,
      range.start,
      length
    )

    return {
      body,
      status: 206,
      headers: {
        "content-type": contentType,
        "content-length": String(length),
        "content-range": `bytes ${range.start}-${range.end}/${size}`,
        "accept-ranges": "bytes",
        "cache-control": "no-store",
      },
    }
  },

  streamHls: async (
    id: number,
    hlsSubPath: string
  ): Promise<{ body: ReadableStream; headers: Record<string, string> }> => {
    if (
      hlsSubPath.includes("..") ||
      !/^[\w\-\/]+\.(m3u8|ts)$/.test(hlsSubPath)
    ) {
      throw new InvalidHlsPathError()
    }

    const video = await videoRepository.findById(id)
    if (!video || !video.hlsPath) throw new HlsNotFoundError()

    const basePath = video.hlsPath.replace(/master\.m3u8$/, "")
    const { body, size } = await videoStorage.readHlsObject(
      basePath + hlsSubPath
    )

    const contentType = hlsSubPath.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : hlsSubPath.endsWith(".ts")
        ? "video/MP2T"
        : "application/octet-stream"

    return {
      body,
      headers: {
        "content-type": contentType,
        "content-length": String(size),
        "cache-control": "public, max-age=31536000",
      },
    }
  },

  deleteVideo: async (id: number) => {
    const deleted = await videoRepository.deleteById(id)
    if (!deleted) throw new VideoNotFoundError(id)

    const paths = [
      deleted.rawPath,
      deleted.thumbnailPath,
      deleted.seekingPreviewPath,
    ].filter((p): p is string => Boolean(p))

    await videoStorage.deleteMany(paths)

    if (deleted.hlsPath) {
      await videoStorage.deleteHlsTree(deleted.hlsPath)
    }

    return { message: "Video deleted successfully" }
  },
}
