"use client"

import { formatTime } from "@/lib/format-time"
import { Slider } from "@workspace/ui/components/slider"
import { useState } from "react"
import type { PreviewConfig } from "./index"

export function ProgressBar({
  duration,
  currentTime,
  seekingPreviewUrl,
  previewConfig,
  onSeek,
  onSeekCommit,
}: {
  duration: number
  currentTime: number
  seekingPreviewUrl: string
  previewConfig: PreviewConfig
  onSeek: (values: number[]) => void
  onSeekCommit: () => void
}) {
  const [hoverPreview, setHoverPreview] = useState<{
    percent: number
    time: number
  } | null>(null)

  // Sprite sheet calculation
  const containerW = 144 // w-36
  const containerH = 80 // h-20
  const { frameIntervalSeconds, columnsPerRow } = previewConfig
  const totalFrames =
    duration > 0 ? Math.floor(duration / frameIntervalSeconds) : 0
  const totalRows = Math.ceil(totalFrames / columnsPerRow) || 1

  function getSpriteStyle(percent: number) {
    if (!totalFrames) return {}
    const frameIndex = Math.min(
      Math.floor((percent / 100) * totalFrames),
      totalFrames - 1
    )
    const col = frameIndex % columnsPerRow
    const row = Math.floor(frameIndex / columnsPerRow)
    return {
      backgroundImage: `url(${seekingPreviewUrl})`,
      backgroundPosition: `-${col * containerW}px -${row * containerH}px`,
      backgroundSize: "contain",
    }
  }

  return (
    <div
      data-slot="seeking-preview"
      className="relative mb-3"
      onPointerMove={(e) => {
        const bounds = e.currentTarget.getBoundingClientRect()
        const percent = Math.min(
          Math.max((e.clientX - bounds.left) / bounds.width, 0),
          1
        )
        setHoverPreview({ percent: percent * 100, time: percent * duration })
      }}
      onPointerLeave={() => setHoverPreview(null)}
    >
      {hoverPreview && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-3 flex -translate-x-1/2 flex-col items-center gap-1"
          style={{
            left: `clamp(4rem, ${hoverPreview.percent}%, calc(100% - 4rem))`,
          }}
        >
          {seekingPreviewUrl && /^https?:\/\//.test(seekingPreviewUrl) && (
            <div
              aria-hidden="true"
              className="h-20 w-36 rounded-md border border-white/10 shadow-xl outline-1 outline-white"
              style={getSpriteStyle(hoverPreview.percent)}
            />
          )}
          <div className="rounded bg-black/85 px-2 py-1 text-[11px] font-medium text-white">
            {formatTime(hoverPreview.time)}
          </div>
        </div>
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
  )
}
