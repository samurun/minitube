import { LazyPlayer } from "@/components/player/lazy-player"
import { apiUrl } from "@/lib/api/client"
import { videosApi } from "@/lib/api/videos"

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export const generateMetadata = async ({ searchParams }: PageProps) => {
  const { v: videoId } = await searchParams

  if (!videoId || Array.isArray(videoId)) {
    return { title: "Video Not Found" }
  }

  try {
    const res = await videosApi.get(videoId)
    return {
      title: res.video.title,
      description:
        res.video.description || "Watch this video on our platform.",
    }
  } catch {
    return { title: "Failed to Load Video" }
  }
}

export default async function Page({ searchParams }: PageProps) {
  const { v: videoId } = await searchParams

  if (!videoId || Array.isArray(videoId)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium">Video not found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Missing or invalid video ID
        </p>
      </div>
    )
  }

  try {
    const res = await videosApi.get(videoId)
    const videoUrl = res.video.videoUrl ? apiUrl(res.video.videoUrl) : null
    const hlsUrl = res.video.hlsUrl ? apiUrl(res.video.hlsUrl) : null

    return (
      <div className="flex flex-col gap-4 px-4 py-6 lg:flex-row">
        <div className="col-span-3 flex w-full flex-col gap-2">
          <LazyPlayer
            videoUrl={videoUrl ?? ""}
            hlsUrl={hlsUrl}
            duration={res.video.duration ?? 0}
            thumbnailUrl={res.video.thumbnailUrl ?? null}
            seekingPreviewUrl={res.video.seekingPreviewUrl ?? null}
            previewConfig={{
              ...(res.preview ?? {}),
              frameIntervalSeconds:
                res.video.seekingPreviewInterval ??
                res.preview?.frameIntervalSeconds ??
                0,
              columnsPerRow:
                res.video.seekingPreviewColumns ??
                res.preview?.columnsPerRow ??
                10,
              tileWidth: res.preview?.tileWidth ?? 160,
              tileHeight: res.preview?.tileHeight ?? 90,
              totalFrames: res.video.seekingPreviewTotalFrames,
              tileWidthActual: res.video.seekingPreviewTileWidth,
              tileHeightActual: res.video.seekingPreviewTileHeight,
            }}
          />
          <div>
            <h1 className="text-lg font-bold">{res.video.title}</h1>
          </div>
        </div>
        <div className="col-span-1 flex min-w-96 items-start">
          <ul className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1">
            {new Array(5).fill(0).map((_, i) => (
              <li
                key={i}
                className="flex flex-col items-start gap-3 lg:flex-row"
              >
                <div className="aspect-video w-full rounded bg-muted" />
                <div className="min-w-35.5 flex-1 space-y-0.5">
                  <p className="text-md font-medium">Related Video {i + 1}</p>
                  <p className="text-xs text-muted-foreground">Channel Name</p>
                  <p className="text-xs text-muted-foreground">
                    10 Views • 1 day ago
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  } catch (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium">Failed to load video</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    )
  }
}
