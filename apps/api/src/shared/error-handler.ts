import { Elysia } from "elysia"
import { DomainError } from "./errors"
import { logger } from "./logger"

export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  ({ error, code, set, request }) => {
    if (error instanceof DomainError) {
      set.status = error.status
      return { error: error.message }
    }

    if (code === "NOT_FOUND") {
      set.status = 404
      return { error: "Not found" }
    }

    if (code === "VALIDATION") {
      set.status = 400
      return { error: "Validation failed", details: error.message }
    }

    logger.error("unhandled request error", {
      path: new URL(request.url).pathname,
      method: request.method,
      err: error instanceof Error ? error.message : String(error),
    })

    set.status = 500
    return { error: "Internal server error" }
  }
)
