export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  "http://localhost:4000"

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init)
  if (!res.ok) {
    throw new ApiError(`Request failed: ${path}`, res.status)
  }
  return res.json() as Promise<T>
}

interface UploadOptions {
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

export function apiUpload<T>(
  path: string,
  formData: FormData,
  { onProgress, signal }: UploadOptions = {}
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const percent = Math.round((event.loaded / event.total) * 100)
      onProgress?.(percent)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T)
        } catch {
          resolve(xhr.responseText as unknown as T)
        }
      } else {
        reject(new ApiError(`Upload failed (${xhr.status})`, xhr.status))
      }
    }

    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.onabort = () =>
      reject(new DOMException("Upload aborted", "AbortError"))

    signal?.addEventListener("abort", () => xhr.abort())

    xhr.open("POST", `${API_BASE_URL}${path}`)
    xhr.send(formData)
  })
}

/** Prefix a path returned by the API (e.g. "/videos/1/stream") with API_BASE_URL. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}
