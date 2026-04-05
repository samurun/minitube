import { eq } from "drizzle-orm"
import { db } from "../../database"
import { videos } from "../../database/schema"
import { deleteFromStorage, uploadToRawBucket } from "../../storage"

// Magic bytes for supported video formats
const VIDEO_SIGNATURES: { bytes: number[]; offset: number }[] = [
  // MP4 / QuickTime — ftyp box
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  // WebM / Matroska — EBML header
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 },
  // AVI — RIFF....AVI
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
]

function isValidVideoFile(buffer: Buffer): boolean {
  return VIDEO_SIGNATURES.some(({ bytes, offset }) =>
    bytes.every((b, i) => buffer[offset + i] === b)
  )
}

export const uploadService = {
  videoUpload: async (file: File) => {
    const { title, objectName } = buildVideoMetadata(file)
    const fileBuffer = await createFileBuffer(file)

    if (!isValidVideoFile(fileBuffer)) {
      throw new Error("Invalid video file: content does not match a supported video format")
    }
    const rawPath = await uploadToRawBucket(objectName, fileBuffer)

    let video: typeof videos.$inferSelect
    try {
      ;[video] = await db
        .insert(videos)
        .values({
          title,
          rawPath,
        })
        .returning()
    } catch (err) {
      // DB insert failed — clean up the orphaned file in MinIO
      await deleteFromStorage(rawPath).catch(() => {})
      throw err
    }

    try {
      // TODO: Queue video processing job here (e.g. using BullMQ or RabbitMQ)

      return { message: "Video uploaded successfully", video }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to queue video job"

      await db
        .update(videos)
        .set({
          status: "failed",
          thumbnailErrorMessage: message,
          seekingPreviewErrorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(videos.id, video.id))
      throw err
    }
  },
}

async function createFileBuffer(file: File) {
  return Buffer.from(await file.arrayBuffer())
}

function buildVideoMetadata(file: File) {
  const timestamp = Date.now()
  const originalName = file.name?.trim() || "video.mp4"
  const title = originalName.replace(/\.[^/.]+$/, "") || `Video ${timestamp}`
  const extension = originalName.split(".").pop() || "mp4"
  const randomSuffix = crypto.randomUUID().slice(0, 8)

  return {
    title,
    objectName: `videos/${timestamp}-${randomSuffix}.${extension}`,
  }
}
