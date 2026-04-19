import type { APIRequestContext } from "@playwright/test"

export const apiBase = () => process.env.E2E_API_URL ?? "http://localhost:4000"

export interface ApiVideo {
  id: number
  title: string
  status: string
}

export async function listVideos(
  request: APIRequestContext
): Promise<ApiVideo[]> {
  const res = await request.get(`${apiBase()}/videos`)
  if (!res.ok()) throw new Error(`GET /videos failed: ${res.status()}`)
  const body = (await res.json()) as { videos: ApiVideo[] }
  return body.videos
}

export async function deleteVideo(
  request: APIRequestContext,
  id: number
): Promise<void> {
  const res = await request.delete(`${apiBase()}/videos/${id}`)
  // 404 is fine — test may have already removed it.
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`DELETE /videos/${id} failed: ${res.status()}`)
  }
}

export async function deleteVideosByTitlePrefix(
  request: APIRequestContext,
  prefix: string
): Promise<void> {
  const videos = await listVideos(request)
  await Promise.all(
    videos
      .filter((v) => v.title.startsWith(prefix))
      .map((v) => deleteVideo(request, v.id))
  )
}
