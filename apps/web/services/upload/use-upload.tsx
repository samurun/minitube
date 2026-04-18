import { videosApi } from "@/lib/api/videos"
import { useMutation } from "@tanstack/react-query"

interface UploadVars {
  file: File
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

export function useUploadVideo() {
  return useMutation({
    mutationFn: ({ file, onProgress, signal }: UploadVars) =>
      videosApi.upload(file, { onProgress, signal }),
  })
}
