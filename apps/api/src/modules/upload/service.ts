import { Readable } from "node:stream"

import { logger } from "../../shared/logger"
import { deleteFromStorage, uploadStreamToRawBucket } from "../../storage"
import { videoRepository } from "../videos/repository"
import { InvalidVideoFormatError } from "../videos/errors"
import { uploadJobPublisher } from "./job-publisher"

const log = logger.child({ module: "upload.service" })

// Magic bytes for supported video formats. We only need the first ~16 bytes
// to validate, so the check never pulls the whole video into memory.
const VIDEO_SIGNATURES: { bytes: number[]; offset: number }[] = [
  // MP4 / QuickTime — ftyp box
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  // WebM / Matroska — EBML header
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 },
  // AVI — RIFF....AVI
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
]

const MAGIC_HEADER_BYTES = 16

function isValidVideoHeader(header: Uint8Array): boolean {
  return VIDEO_SIGNATURES.some(({ bytes, offset }) =>
    bytes.every((b, i) => header[offset + i] === b)
  )
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

export const uploadService = {
  videoUpload: async (file: File) => {
    const { title, objectName } = buildVideoMetadata(file)

    const header = new Uint8Array(
      await file.slice(0, MAGIC_HEADER_BYTES).arrayBuffer()
    )
    if (!isValidVideoHeader(header)) {
      throw new InvalidVideoFormatError()
    }

    // Stream the full body straight into MinIO — API process never holds the
    // whole video in memory, which keeps CPU and heap flat during upload.
    const nodeStream = Readable.fromWeb(
      file.stream() as unknown as import("node:stream/web").ReadableStream
    )
    const rawPath = await uploadStreamToRawBucket(
      objectName,
      nodeStream,
      file.size
    )

    let video
    try {
      video = await videoRepository.create({ title, rawPath })
    } catch (err) {
      // DB insert failed — clean up the orphaned file in MinIO
      await deleteFromStorage(rawPath).catch((cleanupErr) => {
        log.error("failed to clean up orphaned upload", {
          rawPath,
          err:
            cleanupErr instanceof Error
              ? cleanupErr.message
              : String(cleanupErr),
        })
      })
      throw err
    }

    uploadJobPublisher.publishIngestJobs(video.id, video.rawPath)

    log.info("video uploaded", {
      videoId: video.id,
      rawPath: video.rawPath,
      sizeBytes: file.size,
    })

    return {
      message: "Video uploaded successfully",
      video: {
        id: video.id,
        title: video.title,
        status: video.status,
        createdAt: video.createdAt.toISOString(),
        updatedAt: video.updatedAt.toISOString(),
      },
    }
  },
}
