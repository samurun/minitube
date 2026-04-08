# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Minitube is a YouTube clone built as a TypeScript monorepo (Turborepo + pnpm). Videos are uploaded through a Next.js frontend, processed via an Elysia API (Bun runtime) and a Bun worker (consuming RabbitMQ jobs), stored in MinIO (S3-compatible), with metadata in PostgreSQL.

## Commands

### Root-level (run from repo root)

```bash
pnpm dev          # Start all apps (API + Web)
pnpm dev:api      # Start API only
pnpm dev:web      # Start Web only
pnpm build        # Build all workspaces
pnpm lint         # Lint all workspaces
pnpm format       # Format all workspaces
pnpm typecheck    # Type check all workspaces
```

### API (`apps/api`)

```bash
bun run --watch src/index.ts     # Dev server (port 4000)
bunx drizzle-kit push            # Push DB schema changes
bunx drizzle-kit generate        # Generate migration files
```

### Web (`apps/web`)

```bash
pnpm dev          # Next.js dev with Turbopack (port 3000)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm typecheck    # tsc --noEmit
```

### Docker

```bash
docker compose up -d             # Start all services (db, minio, api, worker, web, prometheus, grafana, exporters)
docker compose down              # Stop all services
```

### Adding UI Components

```bash
pnpm dlx shadcn@latest add <component> -c apps/web
```

## System Design

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

  ── Upload Flow ──────────────────────────────────────────────────────────────────

  1. User uploads video via Web
  2. API validates file (magic bytes), stores in MinIO "raw" bucket
  3. API inserts record in PostgreSQL (status: pending)
  4. API publishes 2 jobs to RabbitMQ:
     • video.thumbnail     → extract frame at 1s
     • video.seeking-preview → generate sprite sheet

  ── Worker Flow ──────────────────────────────────────────────────────────────────

  5. Worker consumes job, downloads raw video from MinIO
  6. FFmpeg processes video (thumbnail jpg / sprite sheet jpg)
  7. Worker uploads result to MinIO "processed" bucket
  8. Worker updates PostgreSQL (path + status)
  9. On failure: retry up to 3 times, then mark as failed

  ── Playback Flow ────────────────────────────────────────────────────────────────

  10. Web fetches video metadata from API (presigned URLs)
  11. Player streams video from MinIO via presigned URL
  12. Seeking preview uses sprite sheet with tile calculation

  ── Storage Buckets ──────────────────────────────────────────────────────────────

  MinIO
  ├── raw/           → uploaded original videos
  └── processed/
      ├── thumbnails/        → {videoId}.jpg
      └── seeking-previews/  → {videoId}.jpg (sprite sheet)

  ── Monorepo Structure ───────────────────────────────────────────────────────────

  minitube/
  ├── apps/
  │   ├── web/        → Next.js 16, React 19, Tailwind 4, React Query
  │   ├── api/        → Elysia (Bun), re-exports @workspace/shared
  │   └── worker/     → Bun, FFmpeg, consumes RabbitMQ jobs
  └── packages/
      ├── shared/     → config, database, storage, rabbitmq (shared by api + worker)
      ├── ui/         → shadcn/ui components (Radix UI)
      ├── eslint-config/
      └── typescript-config/
```

### Workspace Structure

- `apps/web` — Next.js 16, React 19, Tailwind CSS 4, React Query
- `apps/api` — Elysia on Bun runtime, re-exports from `@workspace/shared`
- `apps/worker` — Bun worker consuming RabbitMQ jobs (thumbnail + seeking preview generation via FFmpeg)
- `packages/shared` — Shared config, database (Drizzle ORM), storage (MinIO), and RabbitMQ modules
- `packages/ui` — Shared shadcn/ui component library (Radix UI primitives)
- `packages/eslint-config` — Shared ESLint configs (base + Next.js)
- `packages/typescript-config` — Shared tsconfig (base + Next.js)

### API Module Pattern

Routes live in `apps/api/src/modules/<name>/index.ts` with business logic in `service.ts` and validation schemas in `model.ts`. Current modules: `health`, `upload`, `videos`.

### Config & Environment

Shared config lives in `packages/shared/src/config/index.ts`. It manually parses `.env`, detects Docker via `/.dockerenv`, and auto-resolves container hostnames (`db`, `minio`, `rabbitmq`) to `localhost` when running outside Docker.

- Root env: `.env` (shared by API, worker, and Docker Compose)
- Web env: `apps/web/.env` (only `NEXT_PUBLIC_API_URL`)

### Storage

MinIO with two buckets: `raw` (uploaded videos) and `processed` (thumbnails, seeking previews). Storage helpers in `packages/shared/src/storage/index.ts` handle uploads, deletions, and presigned URL generation.

### Database

Single `videos` table (Drizzle ORM + node-postgres). Schema at `packages/shared/src/database/schema.ts`. Videos track `rawPath`, `thumbnailPath`, `seekingPreviewPath`, processing `status` (pending/completed/failed), and error messages. Sprite sheet metadata (`seekingPreviewInterval`, `seekingPreviewColumns`, `seekingPreviewTotalFrames`, `seekingPreviewTileWidth`, `seekingPreviewTileHeight`) is persisted so the player can compute tile offsets without re-probing the sprite.

### Monitoring

The Compose stack includes a Prometheus + Grafana observability bundle:

- **Prometheus** (`:9090`) — scrapes metrics, config at `monitoring/prometheus/prometheus.yml`
- **Grafana** (`:3001`) — dashboards/datasources provisioned from `monitoring/grafana/provisioning/`, dashboard JSON dropped into `monitoring/grafana/dashboards/`. Admin creds via `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`
- **node-exporter** (`:9100`) — host metrics
- **postgres-exporter** (`:9187`) — Postgres metrics
- **MinIO** exposes Prometheus metrics directly (`MINIO_PROMETHEUS_AUTH_TYPE=public`)

> RabbitMQ is currently commented out in `docker-compose.yml`. Run it locally (or uncomment the service, which also enables the `rabbitmq_prometheus` plugin on port `15692`) before starting the API/worker, since both still publish/consume jobs through it.

## Code Style

- Prettier: no semicolons, double quotes, 2-space indent, trailing commas (es5)
- Tailwind class sorting via `prettier-plugin-tailwindcss`
- `cn()` and `cva()` for class merging/variants
- TypeScript strict mode with `noUncheckedIndexedAccess`
- API uses Bun types (`bun-types`), web uses Node.js 20+

## Important Rules

- Do not modify the DB schema without generating a migration (`bunx drizzle-kit generate`)
- API runtime is Bun (not Node.js) — use `Bun.env`, `Bun.spawn`, etc. when needed
- Web app uses `@workspace/ui/*` imports for shared components — never duplicate UI components into `apps/web`
- Frontend path aliases: `@/*` maps to web app root, `@workspace/ui/*` maps to `packages/ui/src/*`
- Shared package imports: `@workspace/shared/config`, `@workspace/shared/database`, `@workspace/shared/storage`, `@workspace/shared/rabbitmq`
