"use client"

import { useVideo } from "@/services/video/use-video"

import { AlertCircle, Video as VideoIcon, RefreshCw } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { VideoCard } from "./video-card"
import { VideoCardSkeleton } from "./video-card-skeleton"

import type { Video } from "@/services/video/types"

export function VideoList() {
  const { data, isLoading, error, refetch } = useVideo()

  if (isLoading) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-semibold">Videos</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="mb-3 size-10 text-destructive" />
        <p className="text-sm font-medium">Failed to load videos</p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => refetch()}
        >
          <RefreshCw className="mr-2 size-3" />
          Try again
        </Button>
      </div>
    )
  }

  if (!data?.videos?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <VideoIcon className="mb-3 size-10 text-muted-foreground" />
        <p className="text-sm font-medium">No videos yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload your first video to get started
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Videos</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.videos.map((video: Video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    </div>
  )
}
