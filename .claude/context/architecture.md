# Architecture

High-level system design and request flows for Minitube. Read this when you need
to understand how a request travels end-to-end (web → api → queue → worker →
storage → playback) or where a piece of state lives.

## Component diagram

```
                        ┌─────────────────────────────────────────────────────────┐
                        │                      Docker Compose                     │
                        │                                                         │
  ┌──────┐   :3000      │  ┌─────────────┐   :4000   ┌──────────────────────┐     │
  │ User │─────────────►│  │   Next.js   │──────────►│     Elysia API       │     │
  │      │◄─────────────│  │   (Web)     │◄──────────│     (Bun)            │     │
  └──────┘              │  └─────────────┘           └──────────┬───────────┘     │
                        │                                       │                 │
                        │                         ┌─────────────┼──────────┐      │
                        │                         │             │          │      │
                        │                         ▼             ▼          ▼      │
                        │                    ┌──────────┐  ┌─────────┐ ┌───────┐  │
                        │                    │PostgreSQL│  │  MinIO  │ │Rabbit │  │
                        │                    │    16    │  │  (S3)   │ │  MQ   │  │
                        │                    └──────────┘  └─────────┘ └───┬───┘  │
                        │                          ▲           ▲           │      │
                        │                          │           │           ▼      │
                        │                          │           │     ┌──────────┐ │
                        │                          └───────────┼─────│  Worker  │ │
                        │                                      └─────│  (Bun)   │ │
                        │                                            └──────────┘ │
                        └─────────────────────────────────────────────────────────┘
```

## Upload flow

1. User uploads a video via the Web app.
2. The API reads only the first 16 bytes to validate magic bytes (MP4/QuickTime,
   Matroska/WebM, AVI). The full body is **streamed** straight into MinIO using
   [`uploadStreamToRawBucket`](../../packages/shared/src/storage/index.ts) — the
   API process never buffers the entire video. See
   [apps/api/src/modules/upload/service.ts](../../apps/api/src/modules/upload/service.ts).
3. The API inserts a row in PostgreSQL with `status: pending`.
4. The API publishes two jobs to RabbitMQ:
   - `video.thumbnail` → extract a frame at 1s
   - `video.seeking-preview` → generate a sprite sheet

> The upload route deliberately bypasses Elysia's `t.File()` body validator
> (it has been unstable for large multipart uploads across Elysia versions) and
> reads `request.formData()` directly. See the comment in
> [apps/api/src/modules/upload/index.ts](../../apps/api/src/modules/upload/index.ts).

## Worker flow

Workers are **split into separate processes per job type** for independent
scaling and resource isolation. Shared logic (generic consumer with
retry/ack, race-safe video status updates) lives in
[packages/worker-core](../../packages/worker-core).

5. Each worker process consumes one job at a time (`ch.prefetch(1)`) and
   runs FFmpeg with `-threads 1` to keep CPU bounded. Since each handler is
   its own container, resource limits are set via Docker `cpus`/`mem_limit`
   per service — no channel-wide prefetch trick needed.
6. **`worker-thumbnail`** extracts a single frame at 1s.
   See [apps/worker-thumbnail/src/handler.ts](../../apps/worker-thumbnail/src/handler.ts).
   Runs on Alpine (lightweight, ~100MB image).
7. **`worker-preview`** uses a two-pass strategy:
   - **Pass 1** writes individual scaled frames to a temp directory at
     `1/interval` fps. A polling loop watches the directory and logs progress
     by file count (FFmpeg's stderr `time=` line is unreliable when the `tile`
     filter is used in a single pass).
   - **Pass 2** stitches the extracted frames into a sprite sheet via the
     `tile` filter — near-instant, no progress reporting needed.
   - Temp files (`tmpInput`, `tmpOutput`, `tmpFramesDir`) are cleaned up in a
     `finally` block.
   - See [apps/worker-preview/src/handler.ts](../../apps/worker-preview/src/handler.ts).
   Runs on Debian (needs `stdbuf` from coreutils for line-buffered FFmpeg
   stderr).
8. The worker uploads results to the MinIO `processed` bucket and updates the
   PostgreSQL row with the path and any sprite metadata.
9. On failure: retry up to 3 times, then mark the row as `failed` with the
    error message.

## Playback flow

11. The Web app fetches video metadata from the API, including presigned
    MinIO URLs.
12. The HTML5 player streams the video from MinIO directly.
13. The seeking preview reads the sprite sheet and computes the correct tile
    offset using the persisted sprite metadata (interval, columns, total
    frames, tile width/height) — no re-probing required.

## MinIO bucket layout

```
MinIO
├── raw/                      → uploaded original videos
└── processed/
    ├── thumbnails/           → {videoId}.jpg
    └── seeking-previews/     → {videoId}.jpg (sprite sheet)
```
