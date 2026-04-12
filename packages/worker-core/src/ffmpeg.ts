export interface RunFFmpegOptions {
  args: string[]
  label: string
  videoId: number
  /** Called with the stderr stream for custom progress parsing */
  onStderr?: (stderr: ReadableStream<Uint8Array>) => Promise<void>
}

export async function runFFmpeg(opts: RunFFmpegOptions): Promise<void> {
  const { args, label, videoId, onStderr } = opts

  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })

  let stderrTail = ""
  if (onStderr) {
    await Promise.all([onStderr(proc.stderr), proc.exited])
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
