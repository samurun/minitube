import { Client } from "minio"
import { config } from "../config"

function createMinioClient(endpoint: string) {
  const normalizedEndpoint =
    endpoint.startsWith("http://") || endpoint.startsWith("https://")
      ? endpoint
      : `${config.minio.useSSL ? "https" : "http"}://${endpoint}`

  const parsed = new URL(normalizedEndpoint)

  return new Client({
    endPoint: parsed.hostname,
    port: parsed.port
      ? parseInt(parsed.port, 10)
      : parsed.protocol === "https:"
        ? 443
        : 80,
    useSSL: parsed.protocol === "https:",
    accessKey: config.minio.rootUser,
    secretKey: config.minio.rootPassword,
    region: "us-east-1",
  })
}

export const minioClient = createMinioClient(config.minio.endpoint)
const publicMinioClient = createMinioClient(config.minio.publicEndpoint)

export async function initStorage() {
  try {
    // Check if raw bucket exists, create if not
    const rawBucketExists = await minioClient.bucketExists(
      config.minio.buckets.raw
    )
    if (!rawBucketExists) {
      await minioClient.makeBucket(config.minio.buckets.raw, "us-east-1")
      console.log(`✓ MinIO bucket '${config.minio.buckets.raw}' created`)
    } else {
      console.log(`✓ MinIO bucket '${config.minio.buckets.raw}' exists`)
    }

    // Check if processed bucket exists, create if not
    const processedBucketExists = await minioClient.bucketExists(
      config.minio.buckets.processed
    )
    if (!processedBucketExists) {
      await minioClient.makeBucket(config.minio.buckets.processed, "us-east-1")
      console.log(`✓ MinIO bucket '${config.minio.buckets.processed}' created`)
    } else {
      console.log(`✓ MinIO bucket '${config.minio.buckets.processed}' exists`)
    }
  } catch (err) {
    console.error("Storage initialization failed:", err)
    throw err
  }
}

export async function uploadToRawBucket(
  objectName: string,
  fileBuffer: Buffer | Uint8Array
) {
  try {
    const payload = Buffer.isBuffer(fileBuffer)
      ? fileBuffer
      : Buffer.from(fileBuffer)

    await minioClient.putObject(
      config.minio.buckets.raw,
      objectName,
      payload,
      payload.length
    )
    return `${config.minio.buckets.raw}/${objectName}`
  } catch (err) {
    console.error("Upload to raw bucket failed:", err)
    throw err
  }
}

export async function deleteFromStorage(storagePath: string) {
  try {
    const { bucket, objectName } = splitStoragePath(storagePath)
    await minioClient.removeObject(bucket, objectName)
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String(err.code)
        : ""
    const message = err instanceof Error ? err.message : String(err)

    if (code === "NoSuchKey" || /not\s*found|no\s*such\s*key/i.test(message)) {
      return
    }

    console.error("Delete from storage failed:", err)
    throw err
  }
}

export function splitStoragePath(storagePath: string) {
  const [bucket, ...objectParts] = storagePath.split("/")
  const objectName = objectParts.join("/")

  if (!bucket || !objectName) {
    throw new Error(`Invalid storage path: ${storagePath}`)
  }

  return { bucket, objectName }
}

export async function getPresignedReadUrl(
  storagePath: string,
  expiresIn = 600
) {
  try {
    const { bucket, objectName } = splitStoragePath(storagePath)

    return await publicMinioClient.presignedGetObject(
      bucket,
      objectName,
      expiresIn
    )
  } catch (err) {
    console.error("Generate presigned URL failed:", err)
    throw err
  }
}
