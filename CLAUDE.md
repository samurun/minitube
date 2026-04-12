# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository. Deeper context is split into
[.claude/context/](./.claude/context) — this file is the index, not the
source of truth for everything.

## Project overview

Minitube is a YouTube clone built as a TypeScript monorepo (Turborepo + pnpm).
Videos are uploaded through a Next.js frontend, streamed into MinIO by an
Elysia API (Bun runtime), then processed asynchronously by dedicated Bun
workers (one per job type) that consume RabbitMQ jobs and run FFmpeg for
thumbnails and sprite-sheet seeking previews. Metadata lives in PostgreSQL.
Worker shared logic (consumer, retry, video-state) lives in
`packages/worker-core`.

## Context map

Load the file that matches what you're doing. Don't read all of them unless
you actually need to.

- **[.claude/context/architecture.md](./.claude/context/architecture.md)** —
  system diagram, upload flow, worker flow, playback flow, bucket layout.
  Read this first when tracing how a request travels end-to-end.
- **[.claude/context/workspaces.md](./.claude/context/workspaces.md)** —
  monorepo layout, API module pattern, path aliases, config & env resolution.
  Read this when adding a new route, package, or touching env wiring.
- **[.claude/context/data-and-infra.md](./.claude/context/data-and-infra.md)** —
  MinIO storage, Postgres/Drizzle schema, Docker Compose (resource caps,
  worker Dockerfile), RabbitMQ, Prometheus/Grafana monitoring stack.
- **[.claude/context/conventions.md](./.claude/context/conventions.md)** —
  code style, important rules, shadcn/ui workflow.

## Commands

### Root (run from repo root)

```bash
pnpm dev          # Start all apps (API + Web)
pnpm dev:api      # Start API only
pnpm dev:web      # Start Web only
pnpm build        # Build all workspaces
pnpm lint         # Lint all workspaces
pnpm format       # Format all workspaces
pnpm typecheck    # Type check all workspaces
```

### API ([apps/api](./apps/api))

```bash
bun run --watch src/index.ts     # Dev server (port 4000)
bunx drizzle-kit push            # Push DB schema changes
bunx drizzle-kit generate        # Generate migration files
```

### Web ([apps/web](./apps/web))

```bash
pnpm dev          # Next.js dev with Turbopack (port 3000)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm typecheck    # tsc --noEmit
```

### Docker

```bash
docker compose up -d    # db, minio, rabbitmq, api, worker-thumbnail, worker-preview, web, monitoring
docker compose down
```

## Critical rules (quick reference)

Full list lives in [.claude/context/conventions.md](./.claude/context/conventions.md).
The ones you must not forget:

- **DB schema changes require a migration** — run `bunx drizzle-kit generate`
  after editing [packages/shared/src/database/schema.ts](./packages/shared/src/database/schema.ts).
- **API runtime is Bun**, not Node.js — use Bun APIs where appropriate.
- **Video uploads must stream** — use `uploadStreamToRawBucket`, never buffer
  the full file into memory.
- **Shared UI lives in [packages/ui](./packages/ui)** and is imported via
  `@workspace/ui/*`. Never duplicate components into `apps/web`.
- **Shared logic lives in [packages/shared](./packages/shared)**, imported via
  `@workspace/shared/{config,database,storage,rabbitmq}`.
- **Worker shared logic lives in [packages/worker-core](./packages/worker-core)** —
  new worker apps should use `registerConsumer` + `updateVideoField` from
  `@workspace/worker-core`.
