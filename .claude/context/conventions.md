# Conventions & rules

Read this before writing or editing code so your output matches the rest of
the repo.

## Code style

- **Prettier**: no semicolons, double quotes, 2-space indent, trailing commas (`es5`)
- **Tailwind**: class sorting via `prettier-plugin-tailwindcss`
- **Class merging / variants**: use `cn()` and `cva()` from
  [packages/ui](../../packages/ui)
- **TypeScript**: strict mode, `noUncheckedIndexedAccess` on
- **Runtimes**: API and worker use Bun types (`bun-types`); web uses Node.js 20+

## Important rules

- **Don't modify the DB schema without a migration** — always run
  `bunx drizzle-kit generate` after editing
  [packages/shared/src/database/schema.ts](../../packages/shared/src/database/schema.ts).
- **API runtime is Bun, not Node.js** — prefer `Bun.spawn`, `Bun.file`, etc.
  when the Bun API is cleaner or required. For env access use `process.env`
  (Bun populates it); `Bun.env` in `packages/shared` would break Next's tsc
  when it walks into the shared package via the `App` type import.
- **Web app uses `@workspace/ui/*` for shared components** — never duplicate
  UI components into [apps/web](../../apps/web). Add new shared primitives to
  [packages/ui](../../packages/ui).
- **Frontend path aliases**:
  - `@/*` → web app root
  - `@workspace/ui/*` → [packages/ui/src/*](../../packages/ui/src)
- **Shared package entry points**:
  - `@workspace/shared/config`
  - `@workspace/shared/database`
  - `@workspace/shared/storage`
  - `@workspace/shared/rabbitmq`
  - `@workspace/shared/logger`
- **Video uploads must stream** — use `uploadStreamToRawBucket`, never buffer
  the full file in the API. See
  [.claude/context/data-and-infra.md](./data-and-infra.md) for the rationale.
- **FFmpeg threads and worker retries are env-configurable** —
  `FFMPEG_THREADS` (default 1), `WORKER_MAX_RETRIES` (default 3).
  Each worker process has `ch.prefetch(1)`. Resource isolation is via
  Docker `cpus`/`mem_limit` per service.
- **Preview sprite config is NOT in .env** — tile width, columns, interval,
  and quality are constants in
  [apps/worker-preview/src/handler.ts](../../apps/worker-preview/src/handler.ts)
  because they're computed from the video or are implementation details.
- **Thumbnail config IS in .env** — `THUMBNAIL_TIMESTAMP_SEC` (default 1),
  `THUMBNAIL_QUALITY` (default 2, JPEG 1-31 scale).
- **Upload max size is in .env** — `UPLOAD_MAX_SIZE_MB` (default 1024 = 1GB).
- **Worker shared utilities** — `probeVideo`, `probeDuration`, and `runFFmpeg`
  live in `@workspace/worker-core`. Don't duplicate ffprobe/ffmpeg logic in
  individual worker handlers.
- **Workers use `startWorker`** — `apps/worker-*/src/index.ts` should be a
  single `await startWorker({ queue, label, handle, onSuccess, onFailed })`
  call. `startWorker` handles DB + RabbitMQ bootstrap, consumer registration,
  graceful drain on SIGTERM, and passes a child logger to the handler. Don't
  hand-wire `initDatabase` / `connectRabbitMQ` / `registerConsumer` in new
  workers — that boilerplate is what `startWorker` replaced.
- **Handlers use `withTempDir`** — scratch directories come from
  `withTempDir(prefix, (dir) => …)`. Don't construct `/tmp/...` paths
  yourself; cleanup is handled automatically in `finally`.
- **Retry uses exponential backoff** — failed jobs wait `1s * 2^attempt` before
  requeue.
- **API errors extend `DomainError`** — for routes, throw a subclass of
  [`DomainError`](../../apps/api/src/shared/errors.ts) (e.g.
  `VideoNotFoundError`, `InvalidVideoFormatError`). The
  [`errorHandler` plugin](../../apps/api/src/shared/error-handler.ts) in
  `src/index.ts` maps them to HTTP responses. Don't set `set.status` and
  return `{ error: ... }` manually from routes.
- **Web API types come from Eden Treaty** — derive request/response types
  from `apps/web/lib/api/videos.ts` (which uses `treaty<App>`), not by
  hand-writing interfaces. Rename or reshape an API response? The web code
  picks it up automatically.
- **SSR never bakes API host into markup** — server components pass raw
  API paths (e.g. `/videos/46/stream`) to client components. The client
  component (`LazyPlayer`) prefixes `NEXT_PUBLIC_API_URL` at render time.
  Calling a `apiUrl()`-style helper in a server component would freeze a
  Docker-internal hostname into HTML that the browser can't resolve.
- **Delete confirmation** — destructive UI actions (e.g. video delete) should
  use `AlertDialog` from `@workspace/ui` for confirmation.
- **Structured logging** — use `createLogger(service)` from
  `@workspace/shared/logger` for JSON-formatted, level-aware logs. The logger
  supports `.child({ videoId })` for adding context. **Never use `console.*`
  in app or worker code** — API entry-point, services, workers, and
  `packages/worker-core` all go through the shared logger. The only
  exception is the logger itself (it's the transport).

## Adding shadcn/ui components

```bash
pnpm dlx shadcn@latest add <component> -c apps/web
```

Components land in [packages/ui](../../packages/ui) and are imported via
`@workspace/ui/*`.
