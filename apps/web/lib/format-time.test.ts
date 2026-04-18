import { describe, it, expect } from "vitest"
import { formatTime } from "./format-time"

describe("formatTime", () => {
  it.each([
    [0, "0:00"],
    [1, "0:01"],
    [9, "0:09"],
    [10, "0:10"],
    [59, "0:59"],
    [60, "1:00"],
    [61, "1:01"],
    [125, "2:05"],
    [599, "9:59"],
    [600, "10:00"],
    [3599, "59:59"],
  ])("formats %i seconds as %s (mm:ss)", (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected)
  })

  it.each([
    [3600, "1:00:00"],
    [3661, "1:01:01"],
    [7325, "2:02:05"],
    [36000, "10:00:00"],
  ])("formats %i seconds as %s (h:mm:ss)", (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected)
  })

  it("floors fractional seconds", () => {
    expect(formatTime(12.7)).toBe("0:12")
  })

  it("clamps negative values to zero", () => {
    expect(formatTime(-5)).toBe("0:00")
  })

  it.each([NaN, Infinity, -Infinity])(
    "returns 0:00 for non-finite input %p",
    (value) => {
      expect(formatTime(value)).toBe("0:00")
    }
  )
})
