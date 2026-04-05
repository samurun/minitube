export interface Video {
  id: number
  title: string
  status: string
  createdAt: string
  updatedAt: string
  videoUrl: string | null
  thumbnailUrl: string | null
  seekingPreviewUrl: string | null
}

export interface VideosResponse {
  message: string
  preview: {
    frameIntervalSeconds: number
    columnsPerRow: number
    tileWidth: number
    tileHeight: number
  }
  videos: Video[]
}
