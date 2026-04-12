import { Readable } from "node:stream"

import { eq, desc } from "drizzle-orm"
import { NotFoundError } from "elysia"

import { db } from "../../database"
import { videos } from "../../database/schema"
import {
  deleteFromStorage,
  getObjectRange,
  getPresignedReadUrl,
  minioClient,
  splitStoragePath,
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
  hlsUrl: string | null
  hlsVariants: object[] | null
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
    const hlsUrl = video.hlsPath
      ? `/videos/${video.id}/hls/master.m3u8`
      : null
    const hlsVariants = video.hlsVariants
      ? (JSON.parse(video.hlsVariants) as object[])
      : null

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
      hlsUrl,
      hlsVariants,
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
      hlsUrl: null,
      hlsVariants: null,
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

  streamHls: async (
    id: number,
    hlsSubPath: string
  ): Promise<{
    body: ReadableStream
    headers: Record<string, string>
  }> => {
    // Prevent path traversal — only allow safe HLS file paths
    if (
      hlsSubPath.includes("..") ||
      !/^[\w\-\/]+\.(m3u8|ts)$/.test(hlsSubPath)
    ) {
      throw new NotFoundError("Invalid HLS path")
    }

    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, id))
      .limit(1)

    if (!video || !video.hlsPath) {
      throw new NotFoundError("HLS content not found")
    }

    const basePath = video.hlsPath.replace(/master\.m3u8$/, "")
    const objectPath = basePath + hlsSubPath

    const contentType = hlsSubPath.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : hlsSubPath.endsWith(".ts")
        ? "video/MP2T"
        : "application/octet-stream"

    const { bucket, objectName } = splitStoragePath(objectPath)
    const stat = await minioClient.statObject(bucket, objectName)
    const stream = await minioClient.getObject(bucket, objectName)

    return {
      body: Readable.toWeb(stream) as unknown as ReadableStream,
      headers: {
        "content-type": contentType,
        "content-length": String(stat.size),
        "cache-control": "public, max-age=31536000",
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

    // Clean up HLS directory (multiple objects under a prefix)
    if (deletedVideo.hlsPath) {
      try {
        const hlsBase = deletedVideo.hlsPath.replace(/master\.m3u8$/, "")
        const { bucket, objectName: prefix } = splitStoragePath(hlsBase)
        const objectsList = minioClient.listObjects(bucket, prefix, true)
        const objectsToDelete: string[] = []
        for await (const obj of objectsList) {
          objectsToDelete.push(obj.name)
        }
        await Promise.allSettled(
          objectsToDelete.map((name) => minioClient.removeObject(bucket, name))
        )
      } catch (err) {
        console.error(
          `Failed to delete HLS objects for video ${id}:`,
          err
        )
      }
    }

    return { message: "Video deleted successfully" }
  },
}
