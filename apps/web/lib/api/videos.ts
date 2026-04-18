import type { VideosResponse, Video } from "@/services/video/types"
import { apiFetch, apiUpload } from "./client"

export interface VideoDetailResponse {
  message: string
  preview?: {
    frameIntervalSeconds?: number
    columnsPerRow: number
    tileWidth: number
    tileHeight: number
  }
  video: Video & { description?: string; hlsUrl?: string | null }
}

export interface UploadVideoResponse {
  message: string
  video: {
    id: number
    title: string
    status: string
    createdAt: string
    updatedAt: string
  }
}

export const videosApi = {
  list: () => apiFetch<VideosResponse>("/videos"),

  get: (videoId: string | number) =>
    apiFetch<VideoDetailResponse>(`/videos/${videoId}`),

  delete: (videoId: string | number) =>
    apiFetch<{ message: string }>(`/videos/${videoId}`, { method: "DELETE" }),

  upload: (
    file: File,
    opts: { onProgress?: (p: number) => void; signal?: AbortSignal } = {}
  ) => {
    const form = new FormData()
    form.append("file", file)
    return apiUpload<UploadVideoResponse>("/upload/video", form, opts)
  },
}
