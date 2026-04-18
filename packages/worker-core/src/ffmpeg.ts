export interface RunFFmpegOptions {
  args: string[]
  label: string
  videoId: number
  /**
   * Progress tracker that consumes stderr for progress parsing and exposes
   * the captured tail on failure. When omitted, runFFmpeg captures stderr
   * itself for error messages.
   */
  progress?: {
    onStderr: (stderr: ReadableStream<Uint8Array>) => Promise<void>
    getTail: () => string
  }
}

export async function runFFmpeg(opts: RunFFmpegOptions): Promise<void> {
  const { args, label, videoId, progress } = opts

  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })

  let stderrTail = ""
  if (progress) {
    await Promise.all([progress.onStderr(proc.stderr), proc.exited])
    stderrTail = progress.getTail()
  } else {
    stderrTail = await new Response(proc.stderr).text()
    await proc.exited
  }

  if (proc.exitCode !== 0) {
    const tail = stderrTail.slice(-500)
    throw new Error(
      `[${label}] FFmpeg failed for video:${videoId} (exit ${proc.exitCode}): ${tail}`
    )
  }
}
