import { Readable } from "node:stream"

import { eq, desc } from "drizzle-orm"
import { NotFoundError } from "elysia"

import { db } from "../../database"
import { videos } from "../../database/schema"
import {
  deleteFromStorage,
  getObjectRange,
  getPresignedReadUrl,
  statObject,
} from "../../storage"
import { config } from "../../config"

type VideoRecord = typeof videos.$inferSelect

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
}

async function attachVideoUrls(video: VideoRecord): Promise<VideoResponse> {
  try {
    const [thumbnailUrl, seekingPreviewUrl] = await Promise.all([
      video.thumbnailPath
        ? getPresignedReadUrl(video.thumbnailPath, 600)
        : null,
      video.seekingPreviewPath
        ? getPresignedReadUrl(video.seekingPreviewPath, 600)
        : null,
    ])
    const videoUrl = `/videos/${video.id}/stream`

    return {
      id: video.id,
      title: video.title,
      status: video.status,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      duration: video.duration,
      videoUrl,
      thumbnailUrl,
      seekingPreviewUrl,
      seekingPreviewInterval: video.seekingPreviewInterval,
      seekingPreviewColumns: video.seekingPreviewColumns,
      seekingPreviewTotalFrames: video.seekingPreviewTotalFrames,
      seekingPreviewTileWidth: video.seekingPreviewTileWidth,
      seekingPreviewTileHeight: video.seekingPreviewTileHeight,
    }
  } catch (err) {
    console.error(
      `Failed to generate presigned URLs for video ${video.id}:`,
      err
    )
    return {
      id: video.id,
      title: video.title,
      status: video.status,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      videoUrl: null,
      duration: video.duration,
      thumbnailUrl: null,
      seekingPreviewUrl: null,
      seekingPreviewInterval: video.seekingPreviewInterval,
      seekingPreviewColumns: video.seekingPreviewColumns,
      seekingPreviewTotalFrames: video.seekingPreviewTotalFrames,
      seekingPreviewTileWidth: video.seekingPreviewTileWidth,
      seekingPreviewTileHeight: video.seekingPreviewTileHeight,
    }
  }
}

export const videoService = {
  getVideos: async (page = 1, pageSize = 20) => {
    const offset = (page - 1) * pageSize
    const records = await db
      .select()
      .from(videos)
      .orderBy(desc(videos.createdAt))
      .limit(pageSize)
      .offset(offset)
    return {
      message: "Videos fetched successfully",
      videos: await Promise.all(records.map(attachVideoUrls)),
    }
  },

  getVideoById: async (id: number) => {
    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, id))
      .limit(1)

    if (!video) {
      throw new NotFoundError("Video not found")
    }

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
    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, id))
      .limit(1)

    if (!video) {
      throw new NotFoundError("Video not found")
    }

    const stat = await statObject(video.rawPath)
    const size = stat.size
    const contentType =
      (stat.metaData && (stat.metaData["content-type"] as string)) ||
      "video/mp4"

    if (!rangeHeader) {
      const stream = await getObjectRange(video.rawPath, 0, size)
      return {
        body: Readable.toWeb(stream) as unknown as ReadableStream,
        status: 200,
        headers: {
          "content-type": contentType,
          "content-length": String(size),
          "accept-ranges": "bytes",
          "cache-control": "no-store",
        },
      }
    }

    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader)
    if (!match || !match[1]) {
      return {
        body: new ReadableStream({ start: (c) => c.close() }),
        status: 416,
        headers: {
          "content-range": `bytes */${size}`,
          "content-type": contentType,
        },
      }
    }

    const start = parseInt(match[1], 10)
    const requestedEnd = match[2] ? parseInt(match[2], 10) : size - 1
    const end = Math.min(requestedEnd, size - 1)

    if (Number.isNaN(start) || start >= size || end < start) {
      return {
        body: new ReadableStream({ start: (c) => c.close() }),
        status: 416,
        headers: {
          "content-range": `bytes */${size}`,
          "content-type": contentType,
        },
      }
    }

    const length = end - start + 1
    const stream = await getObjectRange(video.rawPath, start, length)

    return {
      body: Readable.toWeb(stream) as unknown as ReadableStream,
      status: 206,
      headers: {
        "content-type": contentType,
        "content-length": String(length),
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "cache-control": "no-store",
      },
    }
  },

  deleteVideo: async (id: number) => {
    // Delete from DB first to avoid dangling records pointing to deleted files
    const [deletedVideo] = await db
      .delete(videos)
      .where(eq(videos.id, id))
      .returning()

    if (!deletedVideo) {
      throw new NotFoundError("Video not found")
    }

    // Clean up storage after DB delete succeeds — log failures instead of
    // throwing so a storage hiccup doesn't undo the successful DB delete.
    const storagePaths = [
      deletedVideo.rawPath,
      deletedVideo.thumbnailPath,
      deletedVideo.seekingPreviewPath,
    ].filter((path): path is string => Boolean(path))

    await Promise.allSettled(
      storagePaths.map((path) => deleteFromStorage(path))
    ).then((results) => {
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.error(
            `Failed to delete storage object "${storagePaths[i]}":`,
            r.reason
          )
        }
      })
    })

    return { message: "Video deleted successfully" }
  },
}
