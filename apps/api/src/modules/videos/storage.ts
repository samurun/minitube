import { Readable } from "node:stream"
import {
  deleteFromStorage,
  getObjectRange,
  getPresignedReadUrl,
  minioClient,
  splitStoragePath,
  statObject,
} from "../../storage"
import { logger } from "../../shared/logger"

const log = logger.child({ module: "videos.storage" })

export interface RangeReadResult {
  body: ReadableStream
  size: number
  contentType: string
  start: number
  end: number
}

export const videoStorage = {
  presignRead: (path: string, expiresSec: number) =>
    getPresignedReadUrl(path, expiresSec),

  statRaw: (path: string) => statObject(path),

  readRawRange: async (
    path: string,
    start: number,
    length: number
  ): Promise<ReadableStream> => {
    const stream = await getObjectRange(path, start, length)
    return Readable.toWeb(stream) as unknown as ReadableStream
  },

  readHlsObject: async (
    objectPath: string
  ): Promise<{ body: ReadableStream; size: number }> => {
    const { bucket, objectName } = splitStoragePath(objectPath)
    const [stat, stream] = await Promise.all([
      minioClient.statObject(bucket, objectName),
      minioClient.getObject(bucket, objectName),
    ])
    return {
      body: Readable.toWeb(stream) as unknown as ReadableStream,
      size: stat.size,
    }
  },

  deleteMany: async (paths: string[]): Promise<void> => {
    const results = await Promise.allSettled(
      paths.map((p) => deleteFromStorage(p))
    )
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        log.error("failed to delete storage object", {
          path: paths[i],
          err: r.reason instanceof Error ? r.reason.message : String(r.reason),
        })
      }
    })
  },

  deleteHlsTree: async (masterPath: string): Promise<void> => {
    try {
      const hlsBase = masterPath.replace(/master\.m3u8$/, "")
      const { bucket, objectName: prefix } = splitStoragePath(hlsBase)
      const objects: string[] = []
      for await (const obj of minioClient.listObjects(bucket, prefix, true)) {
        objects.push(obj.name)
      }
      await Promise.allSettled(
        objects.map((name) => minioClient.removeObject(bucket, name))
      )
    } catch (err) {
      log.error("failed to delete HLS tree", {
        path: masterPath,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  },
}
