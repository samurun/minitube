import { useMutation } from "@tanstack/react-query"

type UploadVars = {
  file: File
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

function uploadWithProgress({ file, onProgress, signal }: UploadVars) {
   const URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append("file", file)

    // progress events ยิงทุกครั้งที่ browser ส่ง chunk ขึ้น network
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const percent = Math.round((event.loaded / event.total) * 100)
      onProgress?.(percent)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          resolve(xhr.responseText)
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`))
      }
    }

    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"))

    // รองรับการยกเลิกผ่าน AbortController
    signal?.addEventListener("abort", () => xhr.abort())

    xhr.open("POST", `${URL}/upload/video`)
    xhr.send(formData)
  })
}

export function useUploadVideo() {
  return useMutation({
    mutationFn: uploadWithProgress,
  })
}
