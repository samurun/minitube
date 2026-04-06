"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useVideoPlayer } from "@/hooks/use-player"
import { PlayOverlay } from "./play-overlay"
import { ProgressBar } from "./progress-bar"
import { ControlBar } from "./control-bar"
import { cn } from "@workspace/ui/lib/utils"

export interface PreviewConfig {
  frameIntervalSeconds: number
  columnsPerRow: number
  tileWidth: number
  tileHeight: number
}

interface PlayerProps {
  videoUrl: string
  thumbnailUrl: string | null
  seekingPreviewUrl: string
  previewConfig: PreviewConfig
}

export function Player({
  videoUrl,
  thumbnailUrl,
  seekingPreviewUrl,
  previewConfig,
}: PlayerProps) {
  const {
    wrapperRef,
    videoRef,
    duration,
    currentTime,
    isPlaying,
    volume,
    isFullscreen,
    isVideoReady,
    isUserSeeking,
    videoEvents,
    togglePlay,
    seek,
    seekCommit,
    changeVolume,
    toggleMute,
    toggleFullscreen,
  } = useVideoPlayer()

  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 2500)
  }, [])

  const hideControlsNow = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setShowControls(false)
  }, [])

  useEffect(() => {
    if (!isPlaying) {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setShowControls(true)
      return
    }
    resetHideTimer()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [isPlaying, resetHideTimer])

  const controlsVisible = !isPlaying || showControls || isUserSeeking

  return (
    <div
      data-slot="player-wrapper"
      className="group/player relative aspect-video w-full overflow-hidden rounded-2xl bg-black"
      ref={wrapperRef}
      onPointerMove={resetHideTimer}
      onPointerLeave={() => isPlaying && hideControlsNow()}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={thumbnailUrl ?? "/placeholder.svg"}
        preload="metadata"
        playsInline
        muted={volume === 0}
        {...videoEvents}
        className="pointer-events-none h-full w-full object-contain"
      />

      {/* click layer for play/pause — below overlay & controls */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={togglePlay}
      />

      <PlayOverlay visible={!isPlaying && isVideoReady} onPlay={togglePlay} />

      <div
        data-slot="controls"
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-10 pb-4">
          <ProgressBar
            duration={duration}
            currentTime={currentTime}
            seekingPreviewUrl={seekingPreviewUrl}
            previewConfig={previewConfig}
            onSeek={seek}
            onSeekCommit={seekCommit}
          />

          <ControlBar
            isPlaying={isPlaying}
            volume={volume}
            isFullscreen={isFullscreen}
            currentTime={currentTime}
            duration={duration}
            onTogglePlay={togglePlay}
            onToggleMute={toggleMute}
            onToggleFullscreen={toggleFullscreen}
            onChangeVolume={changeVolume}
          />
        </div>
      </div>
    </div>
  )
}
