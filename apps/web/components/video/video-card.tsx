import type { Video } from "@/services/video/types"
import { useDeleteVideo } from "@/services/video/use-delete-video"
import { useQueryClient } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import { EllipsisVerticalIcon, Loader2 } from "lucide-react"
import Link from "next/link"

interface VideoCardProps {
  video: Video
}

export function VideoCard({ video }: VideoCardProps) {
  const queryClient = useQueryClient()
  const deleteVideoMutation = useDeleteVideo()
  const isUploading = video.status === "uploading"
  const isPending = video.status === "pending"
  const isProcessing = isUploading || isPending
  const statusLabel = isUploading
    ? "Uploading"
    : isPending
      ? "Processing"
      : video.status

  const body = (
    <>
      <div className="relative aspect-video h-42 w-full overflow-hidden bg-muted">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="object-contain h-full w-full"
          />
        ) : (
          <div
            className={cn(
              "h-full w-full",
              isProcessing &&
                "bg-linear-to-brfrom-muted animate-pulse via-muted-foreground/10 to-muted"
            )}
          />
        )}
        {isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/40 backdrop-blur-[1px]">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs font-medium text-foreground">
              {isUploading ? "Uploading..." : "Processing..."}
            </span>
          </div>
        )}
      </div>
      <CardContent className="space-y-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-medium">{video.title}</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(isProcessing && "gap-1")}>
            {isProcessing && <Loader2 className="size-3 animate-spin" />}
            {statusLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(video.createdAt).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </>
  )

  return (
    <Card
      className="group relative gap-0 overflow-hidden pt-0 transition-shadow hover:shadow-md"
      title={isProcessing ? "Video is still processing" : undefined}
    >
      {!isProcessing && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="absolute top-2 right-2 z-10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
            asChild
          >
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={`Actions for ${video.title}`}
            >
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
      )}

      {isUploading ? (
        <div className="block">{body}</div>
      ) : (
        <Link href={`/watch?v=${video.id}`} className="block">
          {body}
        </Link>
      )}
    </Card>
  )
}
