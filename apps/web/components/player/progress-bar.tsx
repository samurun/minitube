"use client"

import { useState } from "react"
import { Slider } from "@workspace/ui/components/slider"
import { formatTime } from "@/lib/format-time"
import { useSpritePreview } from "@/hooks/use-sprite-preview"
import type { PreviewConfig } from "./index"

interface Props {
  duration: number
  currentTime: number
  buffered: number
  seekingPreviewUrl: string
  previewConfig: PreviewConfig
  onSeek: (values: number[]) => void
  onSeekCommit: () => void
}

export function ProgressBar({
  duration,
  currentTime,
  buffered,
  seekingPreviewUrl,
  previewConfig,
  onSeek,
  onSeekCommit,
}: Props) {
  const [hover, setHover] = useState<{ percent: number; time: number } | null>(
    null
  )
  const { containerW, containerH, getStyleAt } = useSpritePreview(
    previewConfig,
    duration,
    seekingPreviewUrl
  )

  const bufferedPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0
  const showSpriteThumbnail =
    !!seekingPreviewUrl && /^https?:\/\//.test(seekingPreviewUrl)

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const bounds = e.currentTarget.getBoundingClientRect()
    const percent = Math.min(
      Math.max((e.clientX - bounds.left) / bounds.width, 0),
      1
    )
    setHover({ percent: percent * 100, time: percent * duration })
  }

  return (
    <div
      data-slot="seeking-preview"
      className="relative mb-3"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHover(null)}
    >
      {hover && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-3 flex -translate-x-1/2 flex-col items-center gap-1"
          style={{
            left: `clamp(${containerW / 2}px, ${hover.percent}%, calc(100% - ${containerW / 2}px))`,
          }}
        >
          {showSpriteThumbnail && (
            <div
              aria-hidden="true"
              className="rounded-md border border-white/10 shadow-xl outline-1 outline-white"
              style={{
                width: containerW,
                height: containerH,
                ...getStyleAt(hover.percent),
              }}
            />
          )}
          <div className="rounded bg-black/85 px-2 py-1 text-[11px] font-medium text-white">
            {formatTime(hover.time)}
          </div>
        </div>
      )}

      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-white/40"
          style={{ width: `${bufferedPct}%` }}
        />
        {hover && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-white/30"
            style={{ width: `${hover.percent}%` }}
          />
        )}
        <Slider
          aria-label="Video progress"
          min={0}
          max={duration || 0}
          step={0.1}
          value={[currentTime]}
          onValueChange={onSeek}
          onValueCommit={onSeekCommit}
          className="cursor-pointer **:data-[slot=slider-range]:bg-red-500 **:data-[slot=slider-thumb]:border-red-500 **:data-[slot=slider-thumb]:bg-red-500 **:data-[slot=slider-thumb]:opacity-0 hover:**:data-[slot=slider-thumb]:opacity-100 **:data-[slot=slider-track]:h-1.5 **:data-[slot=slider-track]:bg-white/20"
        />
      </div>
    </div>
  )
}
