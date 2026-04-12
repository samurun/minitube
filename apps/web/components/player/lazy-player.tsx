"use client"

import dynamic from "next/dynamic"
import { PlayerErrorBoundary } from "./error-boundary"
import type { PreviewConfig } from "./index"

const Player = dynamic(
  () => import("./index").then((mod) => mod.Player),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-video w-full animate-pulse rounded-lg bg-muted" />
    ),
  }
)

interface LazyPlayerProps {
  videoUrl: string
  hlsUrl: string | null
  duration: number
  thumbnailUrl: string | null
  seekingPreviewUrl: string | null
  previewConfig: PreviewConfig
}

export function LazyPlayer({
  seekingPreviewUrl,
  ...rest
}: LazyPlayerProps) {
  return (
    <PlayerErrorBoundary>
      <Player seekingPreviewUrl={seekingPreviewUrl ?? ""} {...rest} />
    </PlayerErrorBoundary>
  )
}
