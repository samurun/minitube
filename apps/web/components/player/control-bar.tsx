import { formatTime } from "@/lib/format-time"
import { Button } from "@workspace/ui/components/button"
import { Slider } from "@workspace/ui/components/slider"
import {
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { QualitySelector } from "./quality-selector"
import type { QualityLevel } from "@/hooks/use-hls"

export function ControlBar({
  isPlaying,
  volume,
  isFullscreen,
  currentTime,
  duration,
  onTogglePlay,
  onToggleMute,
  onToggleFullscreen,
  onChangeVolume,
  qualityLevels,
  currentQuality,
  onSelectQuality,
}: {
  isPlaying: boolean
  volume: number
  isFullscreen: boolean
  currentTime: number
  duration: number
  onTogglePlay: () => void
  onToggleMute: () => void
  onToggleFullscreen: () => void
  onChangeVolume: (values: number[]) => void
  qualityLevels?: QualityLevel[]
  currentQuality?: number
  onSelectQuality?: (index: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-white">
      <div className="flex items-center gap-1.5 md:gap-2">
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause video" : "Play video"}
          className="rounded-full bg-black/20 hover:bg-black/30"
        >
          {isPlaying ? (
            <PauseIcon className="size-4 fill-current" />
          ) : (
            <PlayIcon className="size-4 fill-current" />
          )}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            onClick={onToggleMute}
            aria-label={volume === 0 ? "Unmute video" : "Mute video"}
            className="rounded-full bg-black/20 hover:bg-black/30"
          >
            {volume === 0 ? (
              <VolumeXIcon className="size-4" />
            ) : (
              <Volume2Icon className="size-4" />
            )}
          </Button>

          <div className="hidden w-24 md:block">
            <Slider
              aria-label="Volume"
              min={0}
              max={100}
              step={1}
              value={[volume * 100]}
              onValueChange={onChangeVolume}
              className="cursor-pointer **:data-[slot=slider-range]:bg-white **:data-[slot=slider-thumb]:border-white **:data-[slot=slider-thumb]:bg-white **:data-[slot=slider-track]:h-1 **:data-[slot=slider-track]:bg-white/25"
            />
          </div>
        </div>

        <div className="ml-1 text-xs font-medium text-white/85 tabular-nums md:text-sm">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {qualityLevels && qualityLevels.length > 0 && onSelectQuality && (
          <QualitySelector
            levels={qualityLevels}
            currentLevel={currentQuality ?? -1}
            onSelect={onSelectQuality}
          />
        )}

        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          onClick={onToggleFullscreen}
          aria-label="Toggle fullscreen"
          className="rounded-full bg-black/20 hover:bg-black/30"
        >
          {isFullscreen ? (
            <MinimizeIcon className="size-4" />
          ) : (
            <MaximizeIcon className="size-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
