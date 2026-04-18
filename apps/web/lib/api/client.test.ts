import { describe, it, expect } from "vitest"
import { ApiError, unwrap } from "./client"

describe("ApiError", () => {
  it("carries a message and status", () => {
    const err = new ApiError("boom", 418)
    expect(err.message).toBe("boom")
    expect(err.status).toBe(418)
    expect(err.name).toBe("ApiError")
    expect(err).toBeInstanceOf(Error)
  })
})

describe("unwrap", () => {
  it("returns data when there is no error", () => {
    expect(unwrap({ data: { id: 1 }, error: null })).toEqual({ id: 1 })
  })

  it("passes null data through when there is no error", () => {
    // Valid server response — caller is expected to narrow.
    expect(unwrap({ data: null, error: null })).toBeNull()
  })

  it("throws ApiError with the server-provided error string when present", () => {
    expect(() =>
      unwrap({
        data: null,
        error: { status: 404, value: { error: "Video not found" } },
      })
    ).toThrowError(
      expect.objectContaining({
        name: "ApiError",
        message: "Video not found",
        status: 404,
      })
    )
  })

  it("falls back to a generic message when value has no .error field", () => {
    expect(() =>
      unwrap({ data: null, error: { status: 500, value: { foo: "bar" } } })
    ).toThrowError(
      expect.objectContaining({
        message: "Request failed (500)",
        status: 500,
      })
    )
  })

  it("uses status 500 when the status is not a number", () => {
    expect(() =>
      unwrap({ data: null, error: { status: "oops", value: null } })
    ).toThrowError(
      expect.objectContaining({
        message: "Request failed (500)",
        status: 500,
      })
    )
  })

  it("ignores non-string .error values", () => {
    expect(() =>
      unwrap({
        data: null,
        error: { status: 400, value: { error: { nested: true } } },
      })
    ).toThrowError(
      expect.objectContaining({
        message: "Request failed (400)",
        status: 400,
      })
    )
  })

  it("handles a null value without crashing", () => {
    expect(() =>
      unwrap({ data: null, error: { status: 502, value: null } })
    ).toThrowError(
      expect.objectContaining({
        message: "Request failed (502)",
        status: 502,
      })
    )
  })
})
