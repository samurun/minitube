import { db, eq, and } from "@workspace/shared/database"
import { videos } from "@workspace/shared/database/schema"
import { createLogger } from "@workspace/shared/logger"

const logger = createLogger("worker-core.video-state")

type VideoUpdate = Partial<{
  thumbnailPath: string | null
  thumbnailErrorMessage: string | null
  seekingPreviewPath: string | null
  seekingPreviewErrorMessage: string | null
  duration: number | null
  seekingPreviewInterval: number | null
  seekingPreviewColumns: number | null
  seekingPreviewTotalFrames: number | null
  seekingPreviewTileWidth: number | null
  seekingPreviewTileHeight: number | null
  hlsPath: string | null
  hlsErrorMessage: string | null
  hlsVariants: string | null
}>

export async function updateVideoField(
  videoId: number,
  fields: VideoUpdate
) {
  await db
    .update(videos)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(videos.id, videoId))

  // Atomically check if both jobs are done → update final status.
  // The conditional WHERE prevents a race when two workers finish at the
  // same time: only one UPDATE will match status='pending'.
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1)

  if (!video) return

  const thumbnailDone = video.thumbnailPath || video.thumbnailErrorMessage
  const previewDone =
    video.seekingPreviewPath || video.seekingPreviewErrorMessage
  const transcodeDone = video.hlsPath || video.hlsErrorMessage

  if (thumbnailDone && previewDone && transcodeDone) {
    const allGood = video.thumbnailPath && video.seekingPreviewPath && video.hlsPath
    const finalStatus = allGood ? "completed" : "failed"

    const [updated] = await db
      .update(videos)
      .set({ status: finalStatus, updatedAt: new Date() })
      .where(and(eq(videos.id, videoId), eq(videos.status, "pending")))
      .returning({ id: videos.id })

    if (updated) {
      logger.info("video final status", { videoId, status: finalStatus })
    }
  }
}
