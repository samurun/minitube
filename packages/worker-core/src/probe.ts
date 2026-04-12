export interface VideoMeta {
  duration: number
  width: number
  height: number
}

export async function probeVideo(filePath: string): Promise<VideoMeta> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "csv=p=0",
      filePath,
    ],
    { stdout: "pipe", stderr: "pipe" }
  )
  const output = await new Response(proc.stdout).text()
  await proc.exited
  // csv format outputs two lines: "width,height" then "duration"
  const lines = output.trim().split("\n")
  const [w, h] = (lines[0] ?? "").split(",").map(Number)
  const duration = parseFloat(lines[1] ?? "")
  if (!w || !h || isNaN(duration) || duration <= 0) {
    throw new Error("Could not probe video metadata")
  }
  return { duration, width: w, height: h }
}

export async function probeDuration(filePath: string): Promise<number | null> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      filePath,
    ],
    { stdout: "pipe", stderr: "pipe" }
  )
  const output = await new Response(proc.stdout).text()
  await proc.exited
  const parsed = parseFloat(output.trim())
  return !isNaN(parsed) && parsed > 0 ? parsed : null
}
