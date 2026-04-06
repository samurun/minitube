import type { VideosResponse } from "@/services/video/types"
import { useQuery, useQueryClient } from "@tanstack/react-query"

export function useVideo() {
  const URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
  const queryClient = useQueryClient()
  return useQuery<VideosResponse>({
    queryKey: ["videos"],
    queryFn: async () => {
      const response = await fetch(`${URL}/videos`)
      if (!response.ok) {
        throw new Error("Failed to fetch videos")
      }
      const data = (await response.json()) as VideosResponse
      // Preserve any optimistic placeholders (negative ids) that are still
      // uploading — server doesn't know about them yet, so a naive overwrite
      // would make them disappear mid-upload and cause flicker.
      const previous = queryClient.getQueryData<VideosResponse>(["videos"])
      const optimistic =
        previous?.videos?.filter((v) => v.id < 0 && v.status === "uploading") ??
        []
      if (optimistic.length === 0) return data
      return { ...data, videos: [...optimistic, ...data.videos] }
    },
    // Poll only while there are server-side videos still processing.
    // "uploading" is a client-only optimistic state — don't poll on it,
    // otherwise the refetch races with the in-flight upload.
    refetchInterval: (query) => {
      const hasProcessing = query.state.data?.videos?.some(
        (v) => v.status === "pending"
      )
      return hasProcessing ? 2000 : false
    },
  })
}
