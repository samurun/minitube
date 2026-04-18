import { treaty } from "@elysiajs/eden"
import type { App } from "api/app"
import { API_BASE_URL, apiUpload, unwrap } from "./client"

// Eden Treaty client is kept module-local: exporting it tripped TS2742
// (inferred type cannot be named without deep references to Eden internals).
// Instead, expose typed helpers and derived types.
const api = treaty<App>(API_BASE_URL)

export const videosApi = {
  list: async (opts: { page?: number; pageSize?: number } = {}) =>
    unwrap(
      await api.videos.get({
        query: { page: opts.page ?? 1, pageSize: opts.pageSize ?? 20 },
      })
    ),

  get: async (videoId: string | number) =>
    unwrap(await api.videos({ id: String(videoId) }).get()),

  delete: async (videoId: string | number) =>
    unwrap(await api.videos({ id: String(videoId) }).delete()),

  upload: (
    file: File,
    opts: { onProgress?: (p: number) => void; signal?: AbortSignal } = {}
  ) => {
    const form = new FormData()
    form.append("file", file)
    type UploadResponse = NonNullable<
      Awaited<ReturnType<typeof api.upload.video.post>>["data"]
    >
    return apiUpload<UploadResponse>("/upload/video", form, opts)
  },
}

export type VideosResponse = Awaited<ReturnType<typeof videosApi.list>>
export type VideoDetailResponse = Awaited<ReturnType<typeof videosApi.get>>
export type Video = VideosResponse["videos"][number]
export type UploadedVideo = Awaited<ReturnType<typeof videosApi.upload>>["video"]
