export interface TranscodePreset {
  name: string
  width: number
  height: number
  videoBitrate: string
  audioBitrate: string
  maxrate: string
  bufsize: string
}

export const HLS_PRESETS: TranscodePreset[] = [
  {
    name: "360p",
    width: 640,
    height: 360,
    videoBitrate: "800k",
    audioBitrate: "96k",
    maxrate: "856k",
    bufsize: "1200k",
  },
  {
    name: "480p",
    width: 854,
    height: 480,
    videoBitrate: "1400k",
    audioBitrate: "128k",
    maxrate: "1498k",
    bufsize: "2100k",
  },
  {
    name: "720p",
    width: 1280,
    height: 720,
    videoBitrate: "2800k",
    audioBitrate: "128k",
    maxrate: "2996k",
    bufsize: "4200k",
  },
  {
    name: "1080p",
    width: 1920,
    height: 1080,
    videoBitrate: "5000k",
    audioBitrate: "192k",
    maxrate: "5350k",
    bufsize: "7500k",
  },
]

export function filterPresets(
  sourceWidth: number,
  sourceHeight: number
): TranscodePreset[] {
  const filtered = HLS_PRESETS.filter((p) => p.height <= sourceHeight)
  // If source is below 360p, include the lowest preset anyway
  if (filtered.length === 0) {
    return [HLS_PRESETS[0]]
  }
  return filtered
}
