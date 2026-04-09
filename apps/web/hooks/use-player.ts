import { useCallback, useEffect, useRef, useState } from "react"
import {
  exitFullscreen,
  getFullscreenElement,
  isVideoFullscreen,
  onFullscreenChange,
  requestFullscreen,
} from "@/lib/fullscreen"

function safeDuration(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null
}

export interface VideoPlayerState {
  duration: number
  currentTime: number
  buffered: number
  isPlaying: boolean
  volume: number
  isFullscreen: boolean
  isVideoReady: boolean
  isUserSeeking: boolean
}

export interface VideoPlayerActions {
  togglePlay: () => void
  seek: (values: number[]) => void
  seekCommit: () => void
  changeVolume: (values: number[]) => void
  toggleMute: () => void
  toggleFullscreen: () => Promise<void>
}

/**
 * Headless video player state. The hook owns the `<video>` element through
 * `refs.video` and surfaces state, imperative actions, and the event handlers
 * that must be spread onto the element.
 *
 * `durationHint` is an optional value (e.g. from the API) used until the
 * browser reports its own duration via `loadedmetadata`. The browser value
 * always wins once available.
 */
export function useVideoPlayer(durationHint = 0) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [elementDuration, setElementDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [lastVolume, setLastVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const isSeeking = useRef(false)
  const [isUserSeeking, setIsUserSeeking] = useState(false)

  // Browser-reported duration is the source of truth; fall back to the hint
  // until metadata loads. Re-evaluated each render so prop changes propagate.
  const duration = elementDuration > 0 ? elementDuration : durationHint

  // Sync volume to video element
  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.volume = volume
    videoRef.current.muted = volume === 0
  }, [volume])

  // Fullscreen change listener
  useEffect(() => {
    return onFullscreenChange(() => {
      setIsFullscreen(
        getFullscreenElement() === wrapperRef.current ||
          isVideoFullscreen(videoRef.current)
      )
    })
  }, [])

  const syncDuration = useCallback((el: HTMLVideoElement) => {
    const d = safeDuration(el.duration)
    if (d !== null) setElementDuration(d)
  }, [])

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      void videoRef.current.play().catch(() => {})
    } else {
      videoRef.current.pause()
    }
  }, [])

  const seek = useCallback((values: number[]) => {
    const value = values[0]
    if (!videoRef.current || value == null || Number.isNaN(value)) return

    isSeeking.current = true
    setIsUserSeeking(true)
    videoRef.current.currentTime = value
    setCurrentTime(value)
  }, [])

  const seekCommit = useCallback(() => {
    isSeeking.current = false
    setIsUserSeeking(false)
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

  const changeVolume = useCallback((values: number[]) => {
    const value = values[0]
    if (value == null || Number.isNaN(value)) return

    const nextVolume = Math.min(Math.max(value / 100, 0), 1)
    setVolume(nextVolume)

    if (nextVolume > 0) {
      setLastVolume(nextVolume)
    }
  }, [])

  const toggleMute = useCallback(() => {
    setVolume((prev) => {
      if (prev === 0) return lastVolume || 1
      setLastVolume(prev)
      return 0
    })
  }, [lastVolume])

  const toggleFullscreen = useCallback(async () => {
    if (!wrapperRef.current) return

    const isCurrentlyFullscreen =
      getFullscreenElement() === wrapperRef.current ||
      isVideoFullscreen(videoRef.current)

    try {
      if (isCurrentlyFullscreen) {
        await exitFullscreen(videoRef.current)
      } else {
        await requestFullscreen(wrapperRef.current, videoRef.current)
      }
    } catch {
      // Fullscreen requests can fail (unsupported API or user-gesture
      // restrictions). Ignore — state stays driven by fullscreenchange events.
    }
  }, [])

  const updateBuffered = useCallback((el: HTMLVideoElement) => {
    const ranges = el.buffered
    const t = el.currentTime
    let end = 0
    for (let i = 0; i < ranges.length; i++) {
      const start = ranges.start(i)
      const finish = ranges.end(i)
      if (start <= t && finish >= t) {
        end = finish
        break
      }
      if (finish > end) end = finish
    }
    setBuffered(end)
  }, [])

  const videoEvents = {
    onCanPlay: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      setIsVideoReady(true)
      syncDuration(e.currentTarget)
    },
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) =>
      syncDuration(e.currentTarget),
    onDurationChange: (e: React.SyntheticEvent<HTMLVideoElement>) =>
      syncDuration(e.currentTarget),
    onPlay: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      setIsPlaying(true)
      syncDuration(e.currentTarget)
    },
    onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (!isSeeking.current) {
        setCurrentTime(e.currentTarget.currentTime || 0)
      }
      updateBuffered(e.currentTarget)
    },
    onProgress: (e: React.SyntheticEvent<HTMLVideoElement>) =>
      updateBuffered(e.currentTarget),
    onPause: () => setIsPlaying(false),
  }

  const state: VideoPlayerState = {
    duration,
    currentTime,
    buffered,
    isPlaying,
    volume,
    isFullscreen,
    isVideoReady,
    isUserSeeking,
  }

  const actions: VideoPlayerActions = {
    togglePlay,
    seek,
    seekCommit,
    changeVolume,
    toggleMute,
    toggleFullscreen,
  }

  return {
    refs: { wrapper: wrapperRef, video: videoRef },
    state,
    actions,
    videoEvents,
  }
}
