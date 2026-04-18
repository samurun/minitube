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
| [packages/worker-core](../../packages/worker-core) | `startWorker` runtime (DB + RabbitMQ bootstrap, consumer with retry/ack and graceful drain), `withTempDir`, `createFFmpegProgressTracker`, race-safe `updateVideoField`, `probeVideo` / `probeDuration`, `runFFmpeg` |
| [packages/ui](../../packages/ui) | Shared shadcn/ui component library (Radix UI primitives) |
| [packages/eslint-config](../../packages/eslint-config) | Shared ESLint configs |
| [packages/typescript-config](../../packages/typescript-config) | Shared tsconfig |

### Adding a new worker

To add a new job type (e.g. `worker-foo`):

1. Add the queue + job type in [packages/shared/src/rabbitmq](../../packages/shared/src/rabbitmq)
2. Create `apps/worker-<name>/` with `package.json`, `tsconfig.json`, `src/index.ts`, `src/handler.ts`
3. `src/index.ts` should be a thin `await startWorker({ queue, label, handle, onSuccess, onFailed })` call. The handler receives `(job, { logger })` — no direct bootstrap or shutdown boilerplate.
4. In the handler, use `withTempDir` for scratch dirs and (if FFmpeg is involved) `createFFmpegProgressTracker` for stderr parsing.
5. Create `docker/worker-<name>.Dockerfile`
6. Add the service to [docker-compose.yml](../../docker-compose.yml)

## API module pattern

Routes live under [apps/api/src/modules/](../../apps/api/src/modules)
following this convention:

```
modules/<name>/
├── index.ts        → Elysia route definitions (required; thin HTTP adapter)
├── service.ts      → use-case orchestration (required)
├── repository.ts   → Drizzle queries (optional — when the module owns a table)
├── storage.ts      → MinIO operations (optional — when the module reads/writes objects)
├── errors.ts       → domain errors (extend DomainError from shared/errors.ts)
└── model.ts        → TypeBox validation schemas (optional)
```

The service is the use-case layer: it orchestrates repository + storage +
job-publisher calls and throws domain errors. Routes (`index.ts`) are thin
HTTP adapters — they call the service and let the global
[`errorHandler` plugin](../../apps/api/src/shared/error-handler.ts) map
`DomainError` subclasses to HTTP responses. Cross-cutting concerns
(`logger`, `errorHandler`, `DomainError` base class) live under
[apps/api/src/shared/](../../apps/api/src/shared).

Current modules: `health`, `upload`, `videos`.

Example: the upload module has `service.ts` (validates, streams, inserts),
`job-publisher.ts` (fans out ingest jobs to all three worker queues in one
call), and `index.ts` (route). The videos module has `repository.ts` for
Drizzle, `storage.ts` for MinIO ops, `errors.ts` for `VideoNotFoundError`
etc., and `service.ts` orchestrating them.

> Note: `upload` does **not** have a `model.ts`. The upload route reads
> `request.formData()` directly and validates with magic bytes in the service,
> because Elysia's `t.File()` body validator has been unstable for large
> multipart uploads across versions.

## Web ↔ API types (Eden Treaty)

[apps/api/src/index.ts](../../apps/api/src/index.ts) exports
`type App = typeof app`. The web workspace imports it via
`import type { App } from "api/app"` (exposed through
`apps/api/package.json` `"./app"`) and constructs a typed client with
`treaty<App>(...)`. All request/response types used in
[apps/web/lib/api/](../../apps/web/lib/api) and
[apps/web/services/video/types.ts](../../apps/web/services/video/types.ts)
are derived from the Elysia route tree via `Awaited<ReturnType<...>>` —
**never hand-write an API response interface in web code**.

Two URL constants exist for a reason:

- `API_BASE_URL` in `lib/api/client.ts` — used by the treaty client and
  `apiUpload` for actual fetches. On server, prefers `API_URL`
  (docker-internal `http://api:4000`); on the client, `API_URL` is
  undefined and it falls through to `NEXT_PUBLIC_API_URL`.
- `NEXT_PUBLIC_API_URL` — inlined into the client bundle by Next, used
  inside client components like `LazyPlayer` when an API path needs to be
  rendered into HTML (`<video src>`, HLS playlist). Server components
  should pass **relative paths** to client components; never call a helper
  that prefixes the public host during SSR — the result will be baked into
  markup and the browser will fail to resolve Docker-internal hostnames.

## Path aliases

- Frontend: `@/*` → [apps/web](../../apps/web) root
- Frontend: `@workspace/ui/*` → [packages/ui/src/*](../../packages/ui/src)
- Shared package entry points:
  - `@workspace/shared/config`
  - `@workspace/shared/database`
  - `@workspace/shared/storage`
  - `@workspace/shared/rabbitmq`
  - `@workspace/shared/logger`
  - `@workspace/worker-core` (`startWorker`, `withTempDir`, `createFFmpegProgressTracker`, `registerConsumer`, `updateVideoField`, `probeVideo`/`probeDuration`, `runFFmpeg` — workers only)
- Web-only: `api/app` (Eden Treaty — import `type { App }` to derive typed clients from the Elysia route tree)

## Config & environment

Shared config lives in
[packages/shared/src/config/index.ts](../../packages/shared/src/config/index.ts).
It:

- manually reads `.env` (no dotenv dependency) and populates `process.env`,
- validates every variable through a **zod schema** so missing or malformed
  env values fail fast at startup with the offending field name,
- detects Docker via `/.dockerenv`, and
- auto-resolves container hostnames (`db`, `minio`, `rabbitmq`) to `localhost`
  when running outside Docker, so the same `.env` works both in and out of
  Compose.

> `packages/shared` intentionally reads from `process.env` (not `Bun.env`) so
> Next's tsc can walk into it via the `App` type import without needing
> `bun-types`. Bun populates `process.env` identically, so the behaviour is
> unchanged inside API and worker runtimes.

Env file locations:

- Root `.env` — shared by API, worker, and Docker Compose
- [apps/web/.env](../../apps/web/.env) — only `NEXT_PUBLIC_API_URL`
