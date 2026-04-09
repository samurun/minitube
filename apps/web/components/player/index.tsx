"use client"

import { cn } from "@workspace/ui/lib/utils"
import { useVideoPlayer } from "@/hooks/use-player"
import { useAutoHideControls } from "@/hooks/use-auto-hide-controls"
import { PlayOverlay } from "./play-overlay"
import { ProgressBar } from "./progress-bar"
import { ControlBar } from "./control-bar"

export interface PreviewConfig {
  frameIntervalSeconds: number
  columnsPerRow: number
  tileWidth: number
  tileHeight: number
  totalFrames?: number | null
  tileWidthActual?: number | null
  tileHeightActual?: number | null
}

interface PlayerProps {
  videoUrl: string
  thumbnailUrl: string | null
  duration?: number
  seekingPreviewUrl: string
  previewConfig: PreviewConfig
}

export function Player({
  videoUrl,
  thumbnailUrl,
  duration: durationHint,
  seekingPreviewUrl,
  previewConfig,
}: PlayerProps) {
  const { refs, state, actions, videoEvents } = useVideoPlayer(durationHint)
  const controls = useAutoHideControls({ active: state.isPlaying })

  const controlsVisible = !state.isPlaying || controls.visible || state.isUserSeeking

  return (
    <div
      data-slot="player-wrapper"
      ref={refs.wrapper}
      className="group/player relative aspect-video w-full overflow-hidden rounded-2xl bg-black"
      onPointerMove={controls.show}
      onPointerLeave={() => state.isPlaying && controls.hide()}
    >
      <video
        ref={refs.video}
        src={videoUrl}
        poster={thumbnailUrl ?? "/placeholder.svg"}
        preload="metadata"
        playsInline
        muted={state.volume === 0}
        {...videoEvents}
        className="pointer-events-none h-full w-full object-contain"
      />

      {/* click layer for play/pause — sits below overlay & controls */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={actions.togglePlay}
      />

      <PlayOverlay
        visible={!state.isPlaying && state.isVideoReady}
        onPlay={actions.togglePlay}
      />

      <div
        data-slot="controls"
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <div className="px-4 pt-10 pb-4">
          <ProgressBar
            duration={state.duration}
            currentTime={state.currentTime}
            buffered={state.buffered}
            seekingPreviewUrl={seekingPreviewUrl}
            previewConfig={previewConfig}
            onSeek={actions.seek}
            onSeekCommit={actions.seekCommit}
          />

          <ControlBar
            isPlaying={state.isPlaying}
            volume={state.volume}
            isFullscreen={state.isFullscreen}
            currentTime={state.currentTime}
            duration={state.duration}
            onTogglePlay={actions.togglePlay}
            onToggleMute={actions.toggleMute}
            onToggleFullscreen={actions.toggleFullscreen}
            onChangeVolume={actions.changeVolume}
          />
        </div>
      </div>
    </div>
  )
}
