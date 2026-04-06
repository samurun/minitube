# Minitube

YouTube clone built as a TypeScript monorepo. Videos are uploaded through a Next.js frontend, processed via an Elysia API (Bun runtime) and a Bun worker (consuming RabbitMQ jobs), stored in MinIO (S3-compatible), with metadata in PostgreSQL.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Backend API | Elysia (Bun runtime), Drizzle ORM, TypeBox |
| Database | PostgreSQL 16 |
| Object Storage | MinIO (S3-compatible) |
| Message Queue | RabbitMQ |
| Worker | Bun, FFmpeg (thumbnail + seeking preview generation) |
| Infra | Docker Compose, Turborepo, pnpm workspaces |

## Architecture

```
User --> Next.js (:3000) --> Elysia API (:4000) --> PostgreSQL
                                  |                     |
                                  +------> MinIO <------+
                                  |                     |
                                  +-----> RabbitMQ -----+
                                             |
                                             v
                                      Worker (Bun/FFmpeg)
                                          |         |
                                          v         v
                                        MinIO    PostgreSQL
```

### Upload Flow

1. User uploads video via Web
2. API validates file (magic bytes), stores in MinIO `raw` bucket
3. API inserts record in PostgreSQL (status: pending)
4. API publishes 2 jobs to RabbitMQ:
   - `video.thumbnail` — extract frame at 1s
   - `video.seeking-preview` — generate sprite sheet

### Worker Flow

5. Worker consumes job, downloads raw video from MinIO
6. FFmpeg processes video (thumbnail jpg / sprite sheet jpg)
7. Worker uploads result to MinIO `processed` bucket
8. Worker updates PostgreSQL (path + status)
9. On failure: retry up to 3 times, then mark as failed

### Playback Flow

10. Web fetches video metadata from API (presigned URLs)
11. Player streams video from MinIO via presigned URL
12. Seeking preview uses sprite sheet with tile calculation

### Storage Buckets

```
MinIO
├── raw/           → uploaded original videos
└── processed/
    ├── thumbnails/        → {videoId}.jpg
    └── seeking-previews/  → {videoId}.jpg (sprite sheet)
```

## Project Structure

```
minitube/
├── apps/
│   ├── web/              # Next.js 16, React 19, Tailwind 4, React Query
│   ├── api/              # Elysia (Bun), re-exports @workspace/shared
│   └── worker/           # Bun, FFmpeg, consumes RabbitMQ jobs
├── packages/
│   ├── shared/           # Config, database, storage, RabbitMQ (shared by api + worker)
│   ├── ui/               # shadcn/ui components (Radix UI)
│   ├── eslint-config/    # Shared ESLint configs
│   └── typescript-config/ # Shared tsconfig
├── docker/               # Dockerfiles (api, web, worker)
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
docker compose up -d

# 4. Push database schema
cd apps/api && bunx drizzle-kit push

# 5. Open http://localhost:3000
```

### Local Development (apps outside Docker)

Run only infrastructure in Docker and the apps locally — useful for hot-reload and debugging.

```bash
# 1. Start infra only
docker compose up db minio rabbitmq -d

# 2. Push database schema (first time only)
cd apps/api && bunx drizzle-kit push

# 3. Start API + Web
pnpm dev
```

> **Note:** When running outside Docker, the shared config automatically resolves container hostnames (`db`, `minio`, `rabbitmq`) to `localhost` by detecting the absence of `/.dockerenv`. No need to change `.env` values.

### Environment Variables

All environment variables live in a single root `.env` file, shared by all apps (API, Worker, Web, Docker Compose). Turborepo passes `API_URL` and `NEXT_PUBLIC_API_URL` to Next.js via `globalEnv`.

See `.env.example` for all available variables with defaults.

### Commands

```bash
# Root-level
pnpm dev          # Start all apps (API + Web)
pnpm dev:api      # Start API only
pnpm dev:web      # Start Web only
pnpm build        # Build all workspaces
pnpm lint         # Lint all workspaces
pnpm format       # Format all workspaces
pnpm typecheck    # Type check all workspaces

# Database
cd apps/api && bunx drizzle-kit push       # Push schema changes
cd apps/api && bunx drizzle-kit generate   # Generate migration files

# Docker
docker compose up -d     # Start all services
docker compose down      # Stop all services
```

### Adding UI Components

```bash
pnpm dlx shadcn@latest add <component> -c apps/web
```

Components will be placed in `packages/ui/src/components/` and can be imported as:

```tsx
import { Button } from "@workspace/ui/components/button"
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| MinIO buckets not created | Buckets (`raw`, `processed`) are created automatically by the API on first upload. If issues persist, create them manually via MinIO Console at `http://localhost:9001`. |
| RabbitMQ connection refused | Ensure RabbitMQ container is healthy: `docker compose ps rabbitmq`. It may take a few seconds to start. |
| FFmpeg not found (worker) | Install FFmpeg locally (`brew install ffmpeg` on macOS). Only needed when running the worker outside Docker. |
| Database connection error | Check that the `db` container is running and `.env` credentials match. Run `docker compose logs db` to inspect. |
