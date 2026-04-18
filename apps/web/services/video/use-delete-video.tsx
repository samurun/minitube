import { videosApi } from "@/lib/api/videos"
import { useMutation } from "@tanstack/react-query"

export function useDeleteVideo() {
  return useMutation({
    mutationFn: (videoId: string | number) => videosApi.delete(videoId),
  })
}
