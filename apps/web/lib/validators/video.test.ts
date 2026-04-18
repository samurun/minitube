import { describe, it, expect } from "vitest"
import { formatBytes, validateVideoFile } from "./video"

function fakeFile(name: string, type: string, size = 1024): File {
  const blob = new Blob([new Uint8Array(size)], { type })
  return new File([blob], name, { type })
}

describe("validateVideoFile", () => {
  it.each([
    ["video/mp4", "a.mp4"],
    ["video/webm", "a.webm"],
    ["video/quicktime", "a.mov"],
    ["video/x-msvideo", "a.avi"],
    ["video/x-matroska", "a.mkv"],
  ])("accepts %s", (mime, name) => {
    expect(validateVideoFile(fakeFile(name, mime))).toEqual({ ok: true })
  })

  it("rejects non-video MIME types", () => {
    const result = validateVideoFile(fakeFile("a.txt", "text/plain"))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/Unsupported/)
    }
  })

  it("rejects empty MIME types", () => {
    const result = validateVideoFile(fakeFile("a.mp4", ""))
    expect(result.ok).toBe(false)
  })

  it("rejects files larger than 1GB", () => {
    // Fabricate a File-like object rather than allocating 1GB of memory.
    const oversize = {
      name: "big.mp4",
      type: "video/mp4",
      size: 2 * 1024 * 1024 * 1024,
    } as File

    const result = validateVideoFile(oversize)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/too large/)
    }
  })

  it("accepts files exactly at the 1GB boundary", () => {
    const atLimit = {
      name: "ok.mp4",
      type: "video/mp4",
      size: 1024 * 1024 * 1024,
    } as File
    expect(validateVideoFile(atLimit)).toEqual({ ok: true })
  })
})

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [1024 * 1024, "1.0 MB"],
    [1024 * 1024 * 1024, "1.00 GB"],
    [2.5 * 1024 * 1024 * 1024, "2.50 GB"],
  ])("formats %i as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})
