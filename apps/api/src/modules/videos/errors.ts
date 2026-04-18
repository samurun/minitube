import { NotFoundError, BadRequestError } from "../../shared/errors"

export class VideoNotFoundError extends NotFoundError {
  constructor(id?: number) {
    super(id ? `Video ${id} not found` : "Video not found")
  }
}

export class HlsNotFoundError extends NotFoundError {
  constructor() {
    super("HLS content not found")
  }
}

export class InvalidHlsPathError extends BadRequestError {
  constructor() {
    super("Invalid HLS path")
  }
}

export class InvalidVideoFormatError extends BadRequestError {
  constructor() {
    super(
      "Invalid video file: content does not match a supported video format"
    )
  }
}

export class MissingUploadFileError extends BadRequestError {
  constructor() {
    super("Missing 'file' field in multipart body")
  }
}
