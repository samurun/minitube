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

- Node.js >= 20
- pnpm 9+
- Bun (for API server and worker)
- Docker & Docker Compose
- FFmpeg (for local worker development)

### Setup

```bash
# Install dependencies
pnpm install

# Start all services via Docker
docker compose up -d

# Or start infrastructure only and run apps locally
docker compose up db minio rabbitmq -d

# Run database migration
cd apps/api && bunx drizzle-kit push

# Start development (API + Web)
pnpm dev
```

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
