import { useMemo } from "react"
import type { PreviewConfig } from "@/components/player"

const PREVIEW_HEIGHT_PX = 128

/**
 * Compute sprite-sheet geometry for the seeking preview thumbnail.
 * The display box keeps the source aspect ratio (worker stores actual tile
 * dims after scaling), so portrait videos don't get squashed into 16:9.
 */
export function useSpritePreview(
  previewConfig: PreviewConfig,
  duration: number,
  seekingPreviewUrl: string
) {
  return useMemo(() => {
    const tileW = previewConfig.tileWidthActual ?? previewConfig.tileWidth
    const tileH = previewConfig.tileHeightActual ?? previewConfig.tileHeight
    const containerH = PREVIEW_HEIGHT_PX
    const containerW = Math.round((PREVIEW_HEIGHT_PX * tileW) / tileH)
    const { frameIntervalSeconds, columnsPerRow } = previewConfig

    // Prefer the exact frame count produced by the worker so the tile index
    // matches the sprite even if the browser duration drifts from ffprobe.
    const totalFrames =
      previewConfig.totalFrames ??
      (duration > 0 ? Math.floor(duration / (frameIntervalSeconds || 0)) : 0)
    const totalRows = Math.ceil(totalFrames / columnsPerRow) || 1

    function getStyleAt(percent: number): React.CSSProperties {
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

    return { containerW, containerH, getStyleAt }
  }, [previewConfig, duration, seekingPreviewUrl])
}
