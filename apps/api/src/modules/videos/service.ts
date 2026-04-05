import { eq, desc } from "drizzle-orm"
import { NotFoundError } from "elysia"

import { db } from "../../database"
import { videos } from "../../database/schema"
import { deleteFromStorage, getPresignedReadUrl } from "../../storage"
import { config } from "../../config"

type VideoRecord = typeof videos.$inferSelect

interface VideoResponse {
  id: number
  title: string
  status: string
  createdAt: Date
  updatedAt: Date
  videoUrl: string | null
  thumbnailUrl: string | null
  seekingPreviewUrl: string | null
}

async function attachVideoUrls(video: VideoRecord): Promise<VideoResponse> {
  try {
    const [videoUrl, thumbnailUrl, seekingPreviewUrl] = await Promise.all([
      getPresignedReadUrl(video.rawPath, 600),
      video.thumbnailPath
        ? getPresignedReadUrl(video.thumbnailPath, 600)
        : null,
      video.seekingPreviewPath
        ? getPresignedReadUrl(video.seekingPreviewPath, 600)
        : null,
    ])

    return {
      id: video.id,
      title: video.title,
      status: video.status,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      videoUrl,
      thumbnailUrl,
      seekingPreviewUrl,
    }
  } catch (err) {
    console.error(`Failed to generate presigned URLs for video ${video.id}:`, err)
    return {
      id: video.id,
      title: video.title,
      status: video.status,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      videoUrl: null,
      thumbnailUrl: null,
      seekingPreviewUrl: null,
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
      preview: config.preview,
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
      preview: config.preview,
      video: await attachVideoUrls(video),
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
