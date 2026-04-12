# Data & infrastructure

Read this when touching storage, the database schema, Docker Compose resources,
or the monitoring stack.

## Storage (MinIO)

Two buckets:

- `raw/` — uploaded original videos
- `processed/`
  - `thumbnails/{videoId}.jpg`
  - `seeking-previews/{videoId}.jpg` (sprite sheet)

Helpers in
[packages/shared/src/storage/index.ts](../../packages/shared/src/storage/index.ts)
handle uploads, deletions, presigned URL generation, and path splitting. Two
upload helpers exist:

- `uploadToRawBucket(objectName, buffer)` — buffered upload (legacy / small files).
- `uploadStreamToRawBucket(objectName, stream, size)` — **preferred for video
  uploads**. Streams a Node `Readable` straight into MinIO so the API process
  never holds the full video in memory. This is what
  [apps/api/src/modules/upload/service.ts](../../apps/api/src/modules/upload/service.ts)
  uses.

## Database (PostgreSQL 16 + Drizzle ORM)

Single `videos` table. Schema lives at
[packages/shared/src/database/schema.ts](../../packages/shared/src/database/schema.ts).

Columns of note:

- `rawPath`, `thumbnailPath`, `seekingPreviewPath` — MinIO storage paths
- `status` — `pending` | `completed` | `failed`
- `errorMessage` — populated on terminal failure (after retry budget)
- Sprite-sheet metadata (persisted so the player doesn't re-probe):
  - `seekingPreviewInterval`
  - `seekingPreviewColumns`
  - `seekingPreviewTotalFrames`
  - `seekingPreviewTileWidth`
  - `seekingPreviewTileHeight`

Migrations:

```bash
bunx drizzle-kit generate    # generate migration files from schema changes
bunx drizzle-kit push        # apply schema changes to the DB
```

**Never** modify the schema without generating a migration.

## Docker Compose

[docker-compose.yml](../../docker-compose.yml) runs everything: `db`, `minio`,
`rabbitmq`, `api`, `worker-thumbnail`, `worker-preview`, `web`, `prometheus`,
`grafana`, `node-exporter`, `postgres-exporter`.

Resource caps per service:

- `api`: `cpus: 1.5`, `mem_limit: 1g`
- `worker-thumbnail`: `cpus: 0.5`, `mem_limit: 256m` (lightweight, single frame extraction)
- `worker-preview`: `cpus: 1.5`, `mem_limit: 1g` (CPU-intensive sprite generation)

Each worker has its own Dockerfile:

- [docker/worker-thumbnail.Dockerfile](../../docker/worker-thumbnail.Dockerfile) —
  `oven/bun:1-alpine` + ffmpeg. Small image (~100MB).
- [docker/worker-preview.Dockerfile](../../docker/worker-preview.Dockerfile) —
  `oven/bun:1` (Debian) + ffmpeg + coreutils. Needs glibc for `stdbuf` to
  line-buffer FFmpeg stderr for real-time progress logging.

## RabbitMQ

Defined as a first-class service in Compose (`rabbitmq:3-management-alpine`).
The `rabbitmq_prometheus` plugin is enabled on startup so metrics are exposed
on port `15692`. Both the API (publishes jobs) and worker (consumes jobs)
require it to be running.

Queues are declared in
[packages/shared/src/rabbitmq](../../packages/shared/src/rabbitmq). Each worker
process uses `ch.prefetch(1)` — since they are separate containers, no
channel-wide trick is needed. Resource isolation is handled by Docker
`cpus`/`mem_limit` per service.

## Monitoring

Prometheus + Grafana observability bundle shipped with the Compose stack:

- **Prometheus** (`:9090`) — scrapes metrics.
  Config: [monitoring/prometheus/prometheus.yml](../../monitoring/prometheus/prometheus.yml).
- **Grafana** (`:3001`) — dashboards and datasources provisioned from
  [monitoring/grafana/provisioning/](../../monitoring/grafana/provisioning).
  Drop dashboard JSON into
  [monitoring/grafana/dashboards/](../../monitoring/grafana/dashboards).
  Admin creds via `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`.
- **node-exporter** (`:9100`) — host metrics.
- **postgres-exporter** (`:9187`) — Postgres metrics.
- **MinIO** — exposes Prometheus metrics directly (`MINIO_PROMETHEUS_AUTH_TYPE=public`).
- **RabbitMQ** — `rabbitmq_prometheus` plugin on `:15692`.
