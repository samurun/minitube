import { describe, it, expect, mock, beforeEach } from "bun:test"

// Shared mutable result the mock chain will resolve to. Each test sets this
// before calling into the repository; the thenable proxy below picks it up
// at await time, so chains like `db.select().from(videos).where(...).limit(1)`
// all resolve to whatever we stage here.
const stagedResult: { value: unknown[] } = { value: [] }

function makeThenableChain(): unknown {
  const chain: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (onfulfilled: (v: unknown) => unknown) =>
            Promise.resolve(stagedResult.value).then(onfulfilled)
        }
        return () => chain
      },
    }
  )
  return chain
}

// Mock the shared database re-export: videoRepository imports `db` from
// ../../database, which re-exports from @workspace/shared/database. Stub
// every member the re-export surface references so module evaluation
// doesn't fail on "export not found".
mock.module("@workspace/shared/database", () => ({
  db: makeThenableChain(),
  eq: () => undefined,
  and: () => undefined,
  desc: () => undefined,
  initDatabase: () => Promise.resolve(),
  closeDatabase: () => Promise.resolve(),
  checkDatabaseHealth: () => Promise.resolve("connected"),
}))

mock.module("@workspace/shared/database/schema", () => ({
  videos: {
    id: {},
    createdAt: {},
  },
}))

// Import AFTER mocks so the repository picks up the mocked db.
const { videoRepository } = await import("./repository")

const fakeRow = {
  id: 1,
  title: "test video",
  rawPath: "raw/test.mp4",
  status: "pending",
}

beforeEach(() => {
  stagedResult.value = []
})

describe("videoRepository.findById", () => {
  it("returns null when the row does not exist", async () => {
    stagedResult.value = []
    expect(await videoRepository.findById(99)).toBeNull()
  })

  it("returns the row when found", async () => {
    stagedResult.value = [fakeRow]
    expect(await videoRepository.findById(1)).toEqual(fakeRow as never)
  })
})

describe("videoRepository.deleteById", () => {
  it("returns null when nothing was deleted", async () => {
    stagedResult.value = []
    expect(await videoRepository.deleteById(99)).toBeNull()
  })

  it("returns the deleted row when present", async () => {
    stagedResult.value = [fakeRow]
    expect(await videoRepository.deleteById(1)).toEqual(fakeRow as never)
  })
})

describe("videoRepository.create", () => {
  it("returns the inserted row", async () => {
    stagedResult.value = [fakeRow]
    expect(
      await videoRepository.create({
        title: "test video",
        rawPath: "raw/test.mp4",
      })
    ).toEqual(fakeRow as never)
  })

  it("throws when the insert returns no row", () => {
    stagedResult.value = []
    expect(
      videoRepository.create({ title: "x", rawPath: "y" })
    ).rejects.toThrow("Insert returned no row")
  })
})

describe("videoRepository.list", () => {
  it("returns the collection resolved by the query", async () => {
    const rows = [fakeRow, { ...fakeRow, id: 2 }]
    stagedResult.value = rows
    expect(await videoRepository.list(1, 20)).toEqual(rows as never)
  })

  it("returns an empty array when no rows", async () => {
    stagedResult.value = []
    expect(await videoRepository.list(1, 20)).toEqual([])
  })
})
