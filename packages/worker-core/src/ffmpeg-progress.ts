import type { Logger } from "@workspace/shared/logger"

export interface ProgressTracker {
  onStderr: (stderr: ReadableStream<Uint8Array>) => Promise<void>
  getTail: () => string
}

/**
 * Parses `time=HH:MM:SS.ms` from FFmpeg stderr and reports percent progress
 * against the provided duration. Monotonic — never re-logs the same percent.
 */
export function createFFmpegProgressTracker(
  duration: number,
  logger: Logger,
  context: Record<string, unknown> = {}
): ProgressTracker {
  let buffer = ""
  let lastPct = -1

  return {
    onStderr: async (stderr) => {
      const reader = stderr.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const matches = buffer.match(/time=(\d+):(\d+):(\d+\.\d+)/g)
        if (matches) {
          const last = matches[matches.length - 1]
          const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(last)
          if (m) {
            const secs =
              parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
            const pct = Math.min(100, Math.round((secs / duration) * 100))
            if (pct > lastPct) {
              lastPct = pct
              logger.info("ffmpeg progress", { ...context, pct })
            }
          }
        }

        if (buffer.length > 4096) buffer = buffer.slice(-2048)
      }
    },
    getTail: () => buffer.slice(-500),
  }
}
