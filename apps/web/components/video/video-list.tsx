"use client"

import { useVideo } from "@/services/video/use-video"

import Link from "next/link"
import {
  AlertCircle,
  Video as VideoIcon,
  RefreshCw,
  EllipsisVerticalIcon,
} from "lucide-react"

import type { Video } from "@/services/video/types"
import { useDeleteVideo } from "@/services/video/use-delete-video"

import { Card, CardContent } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"

function VideoCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden pt-0">
      <Skeleton className="aspect-video w-full" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </Card>
  )
}

export function VideoList() {
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useVideo()
  const deleteVideoMutation = useDeleteVideo()

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
          <Card
            key={video.id}
            className="group relative gap-0 overflow-hidden pt-0 transition-shadow hover:shadow-md"
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                asChild
              >
                <Button variant="secondary" size="icon-sm" aria-label={`Actions for ${video.title}`}>
                  <EllipsisVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-9">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    deleteVideoMutation.mutate(String(video.id), {
                      onSuccess: () => {
                        queryClient.invalidateQueries({
                          queryKey: ["videos"],
                        })
                      },
                    })
                  }}
                >
                  ลบ
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href={`/videos/${video.id}`} className="block">
              <div className="aspect-video h-42 w-full bg-muted">
                <img
                  src={
                    video.thumbnailUrl ? video.thumbnailUrl : "/placeholder.svg"
                  }
                  alt={video.title}
                  className={cn(
                    "h-full w-full",
                    video.thumbnailUrl ? "object-contain" : "object-cover"
                  )}
                />
              </div>
              <CardContent className="space-y-1.5 p-3">
                <h3 className="line-clamp-2 text-sm font-medium">
                  {video.title}
                </h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{video.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(video.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  )
}
