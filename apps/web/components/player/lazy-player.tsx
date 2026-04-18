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

// Read at client runtime — Next inlines NEXT_PUBLIC_* into the client bundle.
// Resolving the prefix here (instead of in server components) means SSR bakes
// plain paths into markup, so the URL the browser fetches is always the
// browser-reachable host, without any context-aware juggling on the server.
const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

function withBase(path: string | null): string {
  if (!path) return ""
  return /^https?:\/\//.test(path) ? path : `${PUBLIC_API_URL}${path}`
}

interface LazyPlayerProps {
  /** API path like "/videos/46/stream" — prefixed with the public host here. */
  videoPath: string
  /** API path like "/videos/46/hls/master.m3u8" — prefixed here. */
  hlsPath: string | null
  duration: number
  /** Already absolute (presigned MinIO URL). */
  thumbnailUrl: string | null
  /** Already absolute (presigned MinIO URL). */
  seekingPreviewUrl: string | null
  previewConfig: PreviewConfig
}

export function LazyPlayer({
  videoPath,
  hlsPath,
  seekingPreviewUrl,
  ...rest
}: LazyPlayerProps) {
  return (
    <PlayerErrorBoundary>
      <Player
        videoUrl={withBase(videoPath)}
        hlsUrl={hlsPath ? withBase(hlsPath) : null}
        seekingPreviewUrl={seekingPreviewUrl ?? ""}
        {...rest}
      />
    </PlayerErrorBoundary>
  )
}
