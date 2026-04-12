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
- **API runtime is Bun, not Node.js** — prefer `Bun.env`, `Bun.spawn`, etc.
  when the Bun API is cleaner or required.
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
- **Workers use graceful shutdown** — `registerConsumer` returns a
  `ConsumerHandle` with a `drain()` method. On SIGTERM, call `drain()` to
  finish in-flight jobs before closing the RabbitMQ connection.
- **Retry uses exponential backoff** — failed jobs wait `1s * 2^attempt` before
  requeue.
- **Delete confirmation** — destructive UI actions (e.g. video delete) should
  use `AlertDialog` from `@workspace/ui` for confirmation.
- **Structured logging** — use `createLogger(service)` from
  `@workspace/shared/logger` for JSON-formatted, level-aware logs. The logger
  supports `.child({ videoId })` for adding context.

## Adding shadcn/ui components

```bash
pnpm dlx shadcn@latest add <component> -c apps/web
```

Components land in [packages/ui](../../packages/ui) and are imported via
`@workspace/ui/*`.
