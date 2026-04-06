import { useEffect, useRef, useState, useCallback } from "react"
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

export function useVideoPlayer() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [lastVolume, setLastVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const isSeeking = useRef(false)
  const [isUserSeeking, setIsUserSeeking] = useState(false)

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

  const trySetDuration = useCallback(
    (el: HTMLVideoElement) => {
      const d = safeDuration(el.duration)
      if (d !== null && duration === 0) setDuration(d)
    },
    [duration]
  )

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play()
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

    if (isCurrentlyFullscreen) {
      await exitFullscreen(videoRef.current)
    } else {
      await requestFullscreen(wrapperRef.current, videoRef.current)
    }
  }, [])

  const videoEvents = {
    onCanPlay: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      setIsVideoReady(true)
      trySetDuration(e.currentTarget)
    },
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) =>
      trySetDuration(e.currentTarget),
    onDurationChange: (e: React.SyntheticEvent<HTMLVideoElement>) =>
      trySetDuration(e.currentTarget),
    onPlay: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      setIsPlaying(true)
      trySetDuration(e.currentTarget)
    },
    onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (!isSeeking.current) {
        setCurrentTime(e.currentTarget.currentTime || 0)
      }
    },
    onPause: () => setIsPlaying(false),
  }

  return {
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
  }
}
