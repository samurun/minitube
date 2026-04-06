import { useMutation } from "@tanstack/react-query"

export function useDeleteVideo() {
   const URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
  return useMutation({
    mutationFn: async (videoId: string) => {
      const response = await fetch(`${URL}/videos/${videoId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error("Failed to delete video")
      }
      return response.json()
    },
  })
}
