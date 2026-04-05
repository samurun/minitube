import { useQuery } from "@tanstack/react-query"

export function useVideo() {
  const URL = process.env.NEXT_PUBLIC_API_URL || ""
  return useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const response = await fetch(`${URL}/videos`)
      if (!response.ok) {
        throw new Error("Failed to fetch videos")
      }
      return response.json()
    },
  })
}
