# Minitube

A YouTube-inspired video platform built as a TypeScript monorepo. Videos are uploaded through a Next.js frontend, streamed into MinIO by an Elysia API (Bun runtime), then processed asynchronously by dedicated Bun workers (one per job type) that consume RabbitMQ jobs and run FFmpeg for thumbnails, sprite-sheet seeking previews, and adaptive bitrate HLS transcoding. Metadata lives in PostgreSQL.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, React Query, hls.js, shadcn/ui |
| Backend API | Elysia (Bun runtime), Drizzle ORM, TypeBox |
| Database | PostgreSQL 16 |
| Object Storage | MinIO (S3-compatible) |
| Message Queue | RabbitMQ |
| Workers | Bun + FFmpeg (thumbnail, seeking preview, HLS transcode — one process per job type) |
| Monitoring | Prometheus + Grafana + node-exporter + postgres-exporter |
| CI | GitHub Actions (typecheck, lint, build) |
| Infra | Docker Compose, Turborepo, pnpm workspaces |

## Architecture

```
  Browser (:3000)          Elysia API (:4000)
       |                        |
   Next.js 16             Upload / Stream / HLS proxy
       |                   /    |    \
       |             PostgreSQL MinIO RabbitMQ
       |                              |
       |                    +---------+---------+
       |                    |         |         |
       |               thumbnail  preview  transcode
       |               (worker)  (worker)  (worker)
       |                    |         |         |
       |                    +----MinIO (processed)
       |                              |
       +--------- hls.js playback ----+
```

### Upload Flow

1. User uploads video via Web
2. API validates file (magic bytes), **streams** directly to MinIO `raw` bucket (never buffered in memory)
3. API inserts record in PostgreSQL (status: pending)
4. API publishes 3 jobs to RabbitMQ:
   - `video.thumbnail` — extract frame at 1s
   - `video.seeking-preview` — generate sprite sheet
   - `video.transcode` — generate multi-variant HLS streams

### Worker Flow

5. Each worker process consumes 1 job at a time (`prefetch(1)`)
6. Worker downloads raw video, runs FFmpeg, uploads result to MinIO `processed` bucket
7. Worker updates PostgreSQL (path + metadata)
8. Video status transitions to `completed` only when all 3 jobs succeed (race-safe)
9. On failure: retry up to 3 times with **exponential backoff** (1s, 2s, 4s), then mark as failed
10. On SIGTERM: **graceful shutdown** — drains in-flight job before closing

### Playback Flow

11. Web fetches video metadata from API (presigned URLs)
12. When HLS is ready: **hls.js** handles adaptive bitrate streaming with quality selector
13. When HLS is pending: falls back to raw video streaming with HTTP Range support
14. Seeking preview uses sprite sheet with tile calculation from persisted metadata

### Storage Buckets

```
MinIO
├── raw/                      → uploaded original videos
└── processed/
    ├── thumbnails/           → {videoId}.jpg
    ├── seeking-previews/     → {videoId}.jpg (sprite sheet)
    └── hls/{videoId}/        → adaptive bitrate HLS output
        ├── master.m3u8
        ├── 720p/playlist.m3u8 + segment_*.ts
        ├── 480p/playlist.m3u8 + segment_*.ts
        └── 360p/playlist.m3u8 + segment_*.ts
```

## Project Structure

```
minitube/
├── apps/
│   ├── web/                → Next.js 16, React 19, Tailwind 4, React Query
│   ├── api/                → Elysia (Bun), re-exports @workspace/shared
│   ├── worker-thumbnail/   → Bun, FFmpeg, thumbnail extraction
│   ├── worker-preview/     → Bun, FFmpeg, sprite sheet seeking preview
│   └── worker-transcode/   → Bun, FFmpeg, multi-variant HLS transcoding
├── packages/
│   ├── shared/             → Config, database, storage, RabbitMQ, logger
│   ├── worker-core/        → Consumer, retry, video-state, probe, ffmpeg runner
│   ├── ui/                 → shadcn/ui components (Radix UI)
│   ├── eslint-config/      → Shared ESLint configs
│   └── typescript-config/  → Shared tsconfig
├── docker/                 → Dockerfiles per service
├── monitoring/             → Prometheus & Grafana config
└── docker-compose.yml
```

## Getting Started

### Prerequisites

| Tool | Version | Note |
|------|---------|------|
| Node.js | >= 20 | |
| pnpm | >= 9 | |
| Bun | >= 1.x | API server and worker runtime |
| Docker & Compose | latest | Infrastructure services |
| FFmpeg | any | Required only for local worker development |

### Quick Start (Docker — all services)

```bash
# 1. Clone and install
git clone <repo-url> && cd minitube
pnpm install

# 2. Create env file
cp .env.example .env

# 3. Start everything
pnpm docker:up

# 4. Push database schema
pnpm db:push

# 5. Open http://localhost:3000
```

### Local Development (apps outside Docker)

Run only infrastructure in Docker and the apps locally — useful for hot-reload and debugging.

```bash
# 1. Start infra only
pnpm docker:infra

# 2. Push database schema (first time only)
pnpm db:push

# 3. Start API + Web
pnpm dev
```

> **Note:** When running outside Docker, the shared config automatically resolves container hostnames (`db`, `minio`, `rabbitmq`) to `localhost` by detecting the absence of `/.dockerenv`. No need to change `.env` values.

### Environment Variables

All environment variables live in a single root `.env` file, shared by all apps (API, workers, Docker Compose). Turborepo passes `API_URL` and `NEXT_PUBLIC_API_URL` to Next.js via `globalEnv`. When running outside Docker, container hostnames (`db`, `minio`, `rabbitmq`) are automatically resolved to `localhost`.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API server port |
| `POSTGRES_HOST` | `db` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | — | Database name |
| `POSTGRES_USER` | — | Database user |
| `POSTGRES_PASSWORD` | — | Database password |
| `MINIO_ENDPOINT` | `minio:9000` | MinIO internal endpoint |
| `MINIO_PUBLIC_ENDPOINT` | `localhost:9000` | MinIO public endpoint (for presigned URLs) |
| `MINIO_ROOT_USER` | — | MinIO access key |
| `MINIO_ROOT_PASSWORD` | — | MinIO secret key |
| `MINIO_USE_SSL` | `false` | Use HTTPS for MinIO |
| `MINIO_API_PORT` | `9000` | MinIO API port (Docker host mapping) |
| `MINIO_CONSOLE_PORT` | `9001` | MinIO console port |
| `MINIO_DATA_DIR` | `/data` | MinIO data directory in container |
| `RABBITMQ_HOST` | `rabbitmq` | RabbitMQ host |
| `RABBITMQ_PORT` | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_USER` | `admin` | RabbitMQ user |
| `RABBITMQ_PASS` | `admin` | RabbitMQ password |
| `RABBITMQ_MANAGEMENT_PORT` | `15672` | RabbitMQ management UI port |
| `API_URL` | `http://localhost:4000` | API URL (server-side fetch in Next.js) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API URL (client-side fetch) |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `UPLOAD_MAX_SIZE_MB` | `1024` | Max upload file size in MB |
| `WORKER_MAX_RETRIES` | `3` | Max retry attempts per job |
| `FFMPEG_THREADS` | `1` | FFmpeg threads for thumbnail/preview workers |
| `TRANSCODE_FFMPEG_THREADS` | `2` | FFmpeg threads for transcode worker |
| `HLS_SEGMENT_DURATION` | `6` | HLS segment duration in seconds |
| `THUMBNAIL_TIMESTAMP_SEC` | `1` | Timestamp (sec) to extract thumbnail |
| `THUMBNAIL_QUALITY` | `2` | JPEG quality (1-31, lower = better) |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | `admin` | Grafana admin password |

See [`.env.example`](.env.example) for a ready-to-copy template.

### Commands

```bash
# Development
pnpm dev              # Start API + Web
pnpm dev:api          # Start API only
pnpm dev:web          # Start Web only
pnpm dev:workers      # Start all 3 workers
pnpm dev:all          # Start API + Web + all workers

# Quality checks
pnpm typecheck        # Type check all workspaces
pnpm lint             # Lint all workspaces
pnpm format           # Format all workspaces
pnpm build            # Build all workspaces

# Database
pnpm db:push          # Push schema changes to DB
pnpm db:generate      # Generate migration files

# Docker
pnpm docker:up        # Start full stack (all services + monitoring)
pnpm docker:down      # Stop all services
pnpm docker:infra     # Start infra only (db, minio, rabbitmq)
```

### Adding UI Components

```bash
pnpm dlx shadcn@latest add <component> -c apps/web
```

Components will be placed in `packages/ui/src/components/` and can be imported as:

```tsx
import { Button } from "@workspace/ui/components/button"
```

## Features

- **Video upload** with magic-byte validation and streaming to object storage
- **Adaptive bitrate streaming** (HLS) with automatic quality switching and manual quality selector
- **Seeking preview** with sprite-sheet thumbnails on hover
- **Optimistic UI** updates during upload and processing
- **Worker isolation** with per-job-type containers and resource limits
- **Exponential retry backoff** for failed worker jobs
- **Graceful shutdown** for workers (drains in-flight jobs on SIGTERM)
- **Comprehensive health check** (PostgreSQL + MinIO + RabbitMQ)
- **Path traversal protection** on HLS proxy endpoint
- **Dynamic player loading** with error boundary and retry
- **Delete confirmation** dialog for destructive actions
- **Structured JSON logging** with configurable log levels
- **Monitoring stack** with Prometheus and Grafana dashboards
- **CI pipeline** with GitHub Actions (typecheck, lint, build)
- **Docker health checks** for API with dependent service startup ordering

### Troubleshooting

| Problem | Solution |
|---------|----------|
| MinIO buckets not created | Buckets (`raw`, `processed`) are created automatically by the API on first upload. If issues persist, create them manually via MinIO Console at `http://localhost:9001`. |
| RabbitMQ connection refused | Ensure RabbitMQ container is healthy: `docker compose ps rabbitmq`. It may take a few seconds to start. |
| FFmpeg not found (worker) | Install FFmpeg locally (`brew install ffmpeg` on macOS). Only needed when running the worker outside Docker. |
| Database connection error | Check that the `db` container is running and `.env` credentials match. Run `docker compose logs db` to inspect. |
