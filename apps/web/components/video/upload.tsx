"use client"

import React from "react"
import { UploadCloud, FileVideo, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { useUploadVideo } from "@/services/upload/use-upload"
import { useQueryClient } from "@tanstack/react-query"

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500 MB
const ACCEPTED_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"]

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
  const queryClient = useQueryClient()
  const [isDragging, setIsDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadVideo()

  const handleFileSelect = (selectedFile: File) => {
    const error = validateFile(selectedFile)
    if (error) {
      setValidationError(error)
      setFile(undefined)
      return
    }
    setValidationError(undefined)
    setFile(selectedFile)
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
            <>
              <Loader2 className="size-10 animate-spin text-primary" />
              <p className="text-sm font-medium">Uploading...</p>
              {file && (
                <p className="text-xs text-muted-foreground">{file.name}</p>
              )}
            </>
          ) : uploadMutation.isSuccess ? (
            <>
              <CheckCircle2 className="size-10 text-emerald-500" />
              <p className="text-sm font-medium">Upload complete!</p>
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
                    onClick={() =>
                      uploadMutation.mutate(file, {
                        onSuccess: () => {
                          queryClient.invalidateQueries({
                            queryKey: ["videos"],
                          })
                        },
                      })
                    }
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
          {uploadMutation.isError && (
            <p className="text-xs text-destructive">
              Upload failed: {uploadMutation.error.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
