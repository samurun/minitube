// Base URL for server-side fetches (server components, route handlers).
// Prefers `API_URL` so docker SSR can reach the API via the internal
// hostname `http://api:4000`; the browser never sees `API_URL` because
// Next only inlines `NEXT_PUBLIC_*` — it resolves to `undefined` there and
// falls through to the public URL.
export const API_BASE_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
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

interface EdenResult<T> {
  data: T | null
  error: { status: unknown; value: unknown } | null
}

function extractErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  if (!("error" in value)) return null
  const err = (value as { error: unknown }).error
  return typeof err === "string" ? err : null
}

/**
 * Unwrap a treaty response: throws ApiError on non-2xx, returns data otherwise.
 * React Query relies on throws for its error channel, so hooks consume this
 * instead of the `{ data, error }` tuple directly.
 */
export function unwrap<T>(result: EdenResult<T>): T {
  if (result.error) {
    const status =
      typeof result.error.status === "number" ? result.error.status : 500
    const message =
      extractErrorMessage(result.error.value) ?? `Request failed (${status})`
    throw new ApiError(message, status)
  }
  return result.data as T
}

/**
 * XHR-backed upload that reports progress. Eden Treaty uses fetch under the
 * hood, which doesn't expose upload progress events, so uploads still go
 * through XHR. The response type is imported from Eden so it stays in sync
 * with the API.
 */
export function apiUpload<T>(
  path: string,
  formData: FormData,
  { onProgress, signal }: { onProgress?: (p: number) => void; signal?: AbortSignal } = {}
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress?.(Math.round((event.loaded / event.total) * 100))
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
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"))

    signal?.addEventListener("abort", () => xhr.abort())

    xhr.open("POST", `${API_BASE_URL}${path}`)
    xhr.send(formData)
  })
}
