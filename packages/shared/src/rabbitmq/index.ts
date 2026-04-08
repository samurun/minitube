import amqplib, { type ChannelModel, type Channel } from "amqplib"
import { config } from "../config"

export const QUEUE = {
  THUMBNAIL: "video.thumbnail",
  SEEKING_PREVIEW: "video.seeking-preview",
} as const

export interface ThumbnailJob {
  videoId: number
  rawPath: string
  attempt: number
}

export interface SeekingPreviewJob {
  videoId: number
  rawPath: string
  frameIntervalSeconds: number
  columnsPerRow: number
  tileWidth: number
  tileHeight: number
  attempt: number
}

let connection: ChannelModel | null = null
let channel: Channel | null = null

export async function connectRabbitMQ(): Promise<Channel> {
  const url = `amqp://${config.rabbitmq.user}:${config.rabbitmq.pass}@${config.rabbitmq.host}:${config.rabbitmq.port}`
  connection = await amqplib.connect(url)
  channel = await connection.createChannel()

  connection.on("error", (err: Error) =>
    console.error("RabbitMQ connection error:", err)
  )
  connection.on("close", () => console.warn("RabbitMQ connection closed"))

  // Assert queues so they exist before publishing/consuming
  await channel.assertQueue(QUEUE.THUMBNAIL, { durable: true })
  await channel.assertQueue(QUEUE.SEEKING_PREVIEW, { durable: true })

  console.log("✓ RabbitMQ connected")
  return channel
}

export function getChannel(): Channel {
  if (!channel) throw new Error("RabbitMQ channel not initialized")
  return channel
}

export async function closeRabbitMQ(): Promise<void> {
  await channel?.close()
  await connection?.close()
  channel = null
  connection = null
}

export function publishJob(
  queue: string,
  job: ThumbnailJob | SeekingPreviewJob
) {
  const ch = getChannel()
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(job)), { persistent: true })
}
