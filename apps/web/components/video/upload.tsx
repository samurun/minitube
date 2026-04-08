"use client"

import React from "react"
import { UploadCloud, FileVideo, CheckCircle2, X } from "lucide-react"
import type { VideosResponse } from "@/services/video/types"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"
import { useUploadVideo } from "@/services/upload/use-upload"
import { useQueryClient } from "@tanstack/react-query"

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1 GB
const ACCEPTED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
]

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Unsupported file type. Please upload MP4, WebM, or MOV."
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum size is 500 MB.`
  }
  return null
}

export function UploadVideo() {
  const [file, setFile] = React.useState<File>()
  const [validationError, setValidationError] = React.useState<string>()
  const [progress, setProgress] = React.useState(0)
  const queryClient = useQueryClient()
  const [isDragging, setIsDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const uploadMutation = useUploadVideo()

  const handleUpload = async (selectedFile: File) => {
    const tempId = -Date.now() // negative id เพื่อไม่ชนกับ id จริง
    const controller = new AbortController()
    abortRef.current = controller
    setProgress(0)

    // --- Optimistic update (manual) ---
    await queryClient.cancelQueries({ queryKey: ["videos"] })
    const previous = queryClient.getQueryData<VideosResponse>(["videos"])

    const placeholder = {
      id: tempId,
      title: selectedFile.name,
      status: "uploading",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      videoUrl: null,
      thumbnailUrl: null,
      seekingPreviewUrl: null,
      seekingPreviewInterval: null,
      seekingPreviewColumns: null,
      seekingPreviewTotalFrames: null,
      seekingPreviewTileWidth: null,
      seekingPreviewTileHeight: null,
    }

    queryClient.setQueryData<VideosResponse>(["videos"], (old) => {
      if (!old) return old
      return { ...old, videos: [placeholder, ...old.videos] }
    })

    uploadMutation.mutate(
      {
        file: selectedFile,
        onProgress: setProgress,
        signal: controller.signal,
      },
      {
        onSuccess: (data) => {
          // Swap placeholder -> real video in-place so the card doesn't
          // flicker/remount. Polling in useVideo will pick up thumbnailUrl
          // once the worker is done.
          const realVideo = (
            data as {
              video?: {
                id: number
                title: string
                status: string
                createdAt: string
                updatedAt: string
              }
            }
          )?.video
          if (!realVideo) return
          queryClient.setQueryData<VideosResponse>(["videos"], (old) => {
            if (!old) return old
            return {
              ...old,
              videos: old.videos.map((v) =>
                v.id === tempId
                  ? {
                      ...v,
                      id: realVideo.id,
                      title: realVideo.title,
                      status: realVideo.status,
                      createdAt: realVideo.createdAt,
                      updatedAt: realVideo.updatedAt,
                    }
                  : v
              ),
            }
          })
        },
        onError: () => {
          // rollback ถ้าพลาด
          if (previous) {
            queryClient.setQueryData(["videos"], previous)
          }
        },
        onSettled: () => {
          abortRef.current = null
        },
      }
    )
  }

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const handleFileSelect = (selectedFile: File) => {
    const error = validateFile(selectedFile)
    if (error) {
      setValidationError(error)
      setFile(undefined)
      return
    }
    setValidationError(undefined)
    setFile(selectedFile)
    setProgress(0)
    uploadMutation.reset()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    handleFileSelect(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold">Upload Video</h2>
      <Card
        className={cn(
          "border border-dashed transition-colors",
          isDragging && "border-primary bg-primary/5"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <CardContent className="flex flex-col items-center justify-center gap-3 py-8">
          {uploadMutation.isPending ? (
            <div className="flex w-full max-w-sm flex-col items-center gap-3">
              <FileVideo className="size-10 text-primary" />
              <p className="text-sm font-medium">Uploading...</p>
              {file && (
                <p className="truncate text-xs text-muted-foreground">
                  {file.name}
                </p>
              )}
              <Progress value={progress} className="w-full" />
              <div className="flex w-full justify-between text-xs text-muted-foreground tabular-nums">
                <span>{progress}%</span>
                {file && (
                  <span>
                    {formatBytes((file.size * progress) / 100)} /{" "}
                    {formatBytes(file.size)}
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="mt-1"
              >
                <X className="mr-1 size-3" />
                Cancel
              </Button>
            </div>
          ) : uploadMutation.isSuccess ? (
            <>
              <CheckCircle2 className="size-10 text-emerald-500" />
              <p className="text-sm font-medium">
                Uploaded — processing in background
              </p>
              <p className="max-w-xs text-center text-xs text-muted-foreground">
                You can close this page. Your video will appear in the list once
                processing is done.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFile(undefined)
                  uploadMutation.reset()
                  if (inputRef.current) inputRef.current.value = ""
                }}
              >
                Upload another
              </Button>
            </>
          ) : (
            <>
              <UploadCloud className="size-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  Drag and drop or click to upload
                </p>
                <p className="text-xs text-muted-foreground">MP4, WebM, MOV</p>
              </div>
              {file && (
                <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
                  <FileVideo className="size-4 text-muted-foreground" />
                  <span className="text-xs">{file.name}</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose file
                </Button>
                {file && (
                  <Button
                    size="sm"
                    disabled={uploadMutation.isPending}
                    onClick={() => handleUpload(file)}
                  >
                    Upload
                  </Button>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".mp4,.webm,.mov,.avi,.mkv"
                className="hidden"
                onChange={handleFileChange}
              />
            </>
          )}
          {validationError && (
            <p className="text-xs text-destructive">{validationError}</p>
          )}
          {uploadMutation.isError &&
            uploadMutation.error.name !== "AbortError" && (
              <p className="text-xs text-destructive">
                Upload failed: {uploadMutation.error.message}
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  )
}
