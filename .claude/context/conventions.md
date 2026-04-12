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
- **Video uploads must stream** — use `uploadStreamToRawBucket`, never buffer
  the full file in the API. See
  [.claude/context/data-and-infra.md](./data-and-infra.md) for the rationale.
- **FFmpeg in workers runs with `-threads 1`** and each worker process has
  `ch.prefetch(1)`. Resource isolation is via Docker `cpus`/`mem_limit` per
  service. See [.claude/context/architecture.md](./architecture.md#worker-flow).

## Adding shadcn/ui components

```bash
pnpm dlx shadcn@latest add <component> -c apps/web
```

Components land in [packages/ui](../../packages/ui) and are imported via
`@workspace/ui/*`.
