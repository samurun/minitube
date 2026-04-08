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

  // Sprite sheet calculation. Display container preserves source aspect ratio
  // (worker stores actual tile dims after scaling source video). Box is fit
  // inside MAX_W × MAX_H so portrait videos don't overflow vertically and
  // landscape videos don't get cut on the sides.
  // Fixed height — width scales with source aspect ratio.
  const FIXED_H = 128
  const tileW = previewConfig.tileWidthActual ?? previewConfig.tileWidth
  const tileH = previewConfig.tileHeightActual ?? previewConfig.tileHeight
  const containerH = FIXED_H
  const containerW = Math.round((FIXED_H * tileW) / tileH)
  const { frameIntervalSeconds, columnsPerRow } = previewConfig
  // Prefer the exact frame count produced by the worker (stored in DB) so the
  // tile index always matches the sprite sheet, even if the browser's reported
  // duration drifts slightly from ffprobe's.
  const totalFrames =
    previewConfig.totalFrames ??
    (duration > 0 ? Math.floor(duration / frameIntervalSeconds) : 0)
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
      backgroundSize: `${columnsPerRow * containerW}px ${totalRows * containerH}px`,
      backgroundPosition: `-${col * containerW}px -${row * containerH}px`,
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
            left: `clamp(${containerW / 2}px, ${hoverPreview.percent}%, calc(100% - ${containerW / 2}px))`,
          }}
        >
          {seekingPreviewUrl && /^https?:\/\//.test(seekingPreviewUrl) && (
            <div
              aria-hidden="true"
              className="rounded-md border border-white/10 shadow-xl outline-1 outline-white"
              style={{
                width: containerW,
                height: containerH,
                ...getSpriteStyle(hoverPreview.percent),
              }}
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
