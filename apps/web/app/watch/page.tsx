import { Player } from "@/components/player"

export const metadata = {
  title: "Watch Video",
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function fetchVideo(videoId: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:4000"
  const res = await fetch(`${baseUrl}/videos/${videoId}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch video with id ${videoId}`)
  }
  return res.json()
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
    const res = await fetchVideo(videoId)

    return (
      <div className="flex flex-col gap-4 px-4 py-6 lg:flex-row">
        <div className="col-span-3 flex w-full flex-col gap-2">
          <Player
            videoUrl={res.video.videoUrl}
            thumbnailUrl={res.video.thumbnailUrl ?? null}
            seekingPreviewUrl={res.video.seekingPreviewUrl ?? null}
          />
          <div>
            <h1 className="text-lg font-bold">{res.video.title}</h1>
          </div>
        </div>
        <div className="min-full col-span-1 flex min-w-96 items-start">
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
