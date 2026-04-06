import { Video } from "@/services/video/types"
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
import { EllipsisVerticalIcon } from "lucide-react"
import Link from "next/link"

interface VideoCardProps {
  video: Video
}

export function VideoCard({ video }: VideoCardProps) {
  const queryClient = useQueryClient()
  const deleteVideoMutation = useDeleteVideo()
  return (
    <Card className="group relative gap-0 overflow-hidden pt-0 transition-shadow hover:shadow-md">
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

      <Link href={`/watch?v=${video.id}`} className="block">
        <div className="aspect-video h-42 w-full bg-muted">
          <img
            src={video.thumbnailUrl ? video.thumbnailUrl : "/placeholder.svg"}
            alt={video.title}
            className={cn(
              "h-full w-full",
              video.thumbnailUrl ? "object-contain" : "object-cover"
            )}
          />
        </div>
        <CardContent className="space-y-1.5 p-3">
          <h3 className="line-clamp-2 text-sm font-medium">{video.title}</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{video.status}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(video.createdAt).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}
