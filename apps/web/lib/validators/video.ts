const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1 GB

const ACCEPTED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
]

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export function validateVideoFile(file: File): ValidationResult {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: "Unsupported file type. Please upload MP4, WebM, or MOV.",
    }
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
    }
  }
  return { ok: true }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
