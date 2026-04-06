"use client"

import { formatTime } from "@/lib/format-time"
import { Slider } from "@workspace/ui/components/slider"
import { useState } from "react"

export function ProgressBar({
  duration,
  currentTime,
  seekingPreviewUrl,
  onSeek,
  onSeekCommit,
}: {
  duration: number
  currentTime: number
  seekingPreviewUrl: string
  onSeek: (values: number[]) => void
  onSeekCommit: () => void
}) {
  const [hoverPreview, setHoverPreview] = useState<{
    percent: number
    time: number
  } | null>(null)

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
              className="h-20 w-36 rounded-md border border-white/10 bg-black shadow-xl"
              style={{
                backgroundImage: `url(${encodeURI(seekingPreviewUrl)})`,
                backgroundPosition: `${hoverPreview.percent}% center`,
                backgroundSize: "cover",
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
