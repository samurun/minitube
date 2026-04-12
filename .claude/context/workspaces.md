# Workspaces & module layout

Read this when you need to know where code lives, how a new API route should
be structured, or how env/config is wired across the monorepo.

## Monorepo layout

```
minitube/
├── apps/
│   ├── web/               → Next.js 16, React 19, Tailwind 4, React Query
│   ├── api/               → Elysia (Bun), re-exports @workspace/shared
│   ├── worker-thumbnail/  → Bun, FFmpeg, consumes video.thumbnail queue
│   ├── worker-preview/    → Bun, FFmpeg, consumes video.seeking-preview queue
│   └── worker-transcode/  → Bun, FFmpeg, consumes video.transcode queue (HLS)
└── packages/
    ├── shared/            → config, database, storage, rabbitmq (shared by api + workers)
    ├── worker-core/       → generic consumer, retry logic, video-state updates (shared by workers)
    ├── ui/                → shadcn/ui components (Radix UI)
    ├── eslint-config/     → shared ESLint configs (base + Next.js)
    └── typescript-config/ → shared tsconfig (base + Next.js)
```

| Workspace | Runtime / stack |
|---|---|
| [apps/web](../../apps/web) | Next.js 16, React 19, Tailwind CSS 4, React Query |
| [apps/api](../../apps/api) | Elysia on Bun runtime, re-exports from `@workspace/shared` |
| [apps/worker-thumbnail](../../apps/worker-thumbnail) | Bun + FFmpeg, thumbnail extraction (Alpine image) |
| [apps/worker-preview](../../apps/worker-preview) | Bun + FFmpeg, sprite-sheet seeking preview (Debian image) |
| [apps/worker-transcode](../../apps/worker-transcode) | Bun + FFmpeg, multi-variant HLS transcode (Debian image) |
| [packages/shared](../../packages/shared) | Shared config, Drizzle ORM database, MinIO storage, RabbitMQ, structured logger |
| [packages/worker-core](../../packages/worker-core) | Generic consumer wrapper, retry/ack with exponential backoff, graceful drain, race-safe video status updates, `probeVideo`/`probeDuration`, `runFFmpeg` |
| [packages/ui](../../packages/ui) | Shared shadcn/ui component library (Radix UI primitives) |
| [packages/eslint-config](../../packages/eslint-config) | Shared ESLint configs |
| [packages/typescript-config](../../packages/typescript-config) | Shared tsconfig |

### Adding a new worker

To add a new job type (e.g. `worker-foo`):

1. Add the queue + job type in [packages/shared/src/rabbitmq](../../packages/shared/src/rabbitmq)
2. Create `apps/worker-<name>/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/handler.ts`
3. Use `registerConsumer` from `@workspace/worker-core` to wire handler → queue
4. Create `docker/worker-<name>.Dockerfile`
5. Add the service to [docker-compose.yml](../../docker-compose.yml)

## API module pattern

Routes live under [apps/api/src/modules/](../../apps/api/src/modules)
following this convention:

```
modules/<name>/
├── index.ts     → Elysia route definitions (required)
├── service.ts   → business logic (required)
└── model.ts     → TypeBox validation schemas (optional — only when the
                   route benefits from declarative body validation)
```

Current modules: `health`, `upload`, `videos`.

> Note: `upload` does **not** have a `model.ts`. The upload route reads
> `request.formData()` directly and validates with magic bytes in the service,
> because Elysia's `t.File()` body validator has been unstable for large
> multipart uploads across versions.

## Path aliases

- Frontend: `@/*` → [apps/web](../../apps/web) root
- Frontend: `@workspace/ui/*` → [packages/ui/src/*](../../packages/ui/src)
- Shared package entry points:
  - `@workspace/shared/config`
  - `@workspace/shared/database`
  - `@workspace/shared/storage`
  - `@workspace/shared/rabbitmq`
  - `@workspace/shared/logger`
  - `@workspace/worker-core` (consumer, video-state, probe, ffmpeg — workers only)

## Config & environment

Shared config lives in
[packages/shared/src/config/index.ts](../../packages/shared/src/config/index.ts).
It:

- manually parses `.env` (no dotenv dependency),
- detects Docker via `/.dockerenv`, and
- auto-resolves container hostnames (`db`, `minio`, `rabbitmq`) to `localhost`
  when running outside Docker, so the same `.env` works both in and out of
  Compose.

Env file locations:

- Root `.env` — shared by API, worker, and Docker Compose
- [apps/web/.env](../../apps/web/.env) — only `NEXT_PUBLIC_API_URL`
