export interface Video {
  id: number
  title: string
  status: string
  createdAt: string
  updatedAt: string
  videoUrl: string | null
  thumbnailUrl: string | null
  seekingPreviewUrl: string | null
  seekingPreviewInterval: number | null
  seekingPreviewColumns: number | null
  seekingPreviewTotalFrames: number | null
  seekingPreviewTileWidth: number | null
  seekingPreviewTileHeight: number | null
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
