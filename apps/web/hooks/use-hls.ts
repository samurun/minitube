import { useCallback, useEffect, useRef, useState } from "react"
import type Hls from "hls.js"

export interface QualityLevel {
  index: number
  height: number
  label: string
}

export interface HlsState {
  levels: QualityLevel[]
  currentLevel: number // -1 = auto
  setLevel: (index: number) => void // -1 to switch back to auto
  isAuto: boolean
}

export function useHls(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  hlsUrl: string | null
): HlsState {
  const hlsRef = useRef<Hls | null>(null)
  const [levels, setLevels] = useState<QualityLevel[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !hlsUrl) {
      setLevels([])
      setCurrentLevel(-1)
      return
    }

    let hls: Hls | null = null
    let destroyed = false

    // Always prefer hls.js when available — it exposes quality levels for the
    // selector UI. Only fall back to native HLS when hls.js isn't supported
    // (e.g. iOS Safari without MSE).
    import("hls.js").then((HlsModule) => {
      const HlsClass = HlsModule.default
      if (destroyed) return

      if (!HlsClass.isSupported()) {
        video.src = hlsUrl
        return
      }

      hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: false,
      })
      hlsRef.current = hls

      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
        if (!hls) return
        const qualityLevels: QualityLevel[] = hls.levels.map((level, i) => ({
          index: i,
          height: level.height,
          label: `${level.height}p`,
        }))
        qualityLevels.sort((a, b) => b.height - a.height)
        setLevels(qualityLevels)
        setCurrentLevel(-1)
      })

      hls.on(HlsClass.Events.LEVEL_SWITCHED, () => {
        if (hls && hls.currentLevel === -1) {
          setCurrentLevel(-1)
        }
      })

      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
    })

    return () => {
      destroyed = true
      if (hls) {
        hls.destroy()
      }
      hlsRef.current = null
      setLevels([])
      setCurrentLevel(-1)
    }
  }, [videoRef, hlsUrl])

  const setLevel = useCallback((index: number) => {
    const hls = hlsRef.current
    if (!hls) return
    hls.currentLevel = index
    setCurrentLevel(index)
  }, [])

  return {
    levels,
    currentLevel,
    setLevel,
    isAuto: currentLevel === -1,
  }
}
