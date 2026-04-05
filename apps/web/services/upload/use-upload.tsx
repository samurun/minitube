import { useMutation, useQueryClient } from "@tanstack/react-query"

export function useUploadVideo() {
  const URL = process.env.NEXT_PUBLIC_API_URL || ""
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch(`${URL}/upload/video`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to upload video")
      }

      return response.json()
    },
  })
}
