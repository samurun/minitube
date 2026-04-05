# Minitube

Video processing platform built with a modern TypeScript monorepo architecture.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS, shadcn/ui |
| Backend API | Elysia (Bun runtime), Drizzle ORM, TypeBox |
| Database | PostgreSQL 16 |
| Object Storage | MinIO (S3-compatible) |
| Message Queue | RabbitMQ |
| Worker | Background job processing |
| Infra | Docker Compose, Turborepo, pnpm workspaces |

## Architecture

```
User → Next.js (3000) → Elysia API (4000) → PostgreSQL
                                            → MinIO (raw/processed buckets)
                                            → RabbitMQ → Worker (video processing)
```

## Project Structure

```
minitube/
├── apps/
│   ├── web/          # Next.js frontend
│   ├── api/          # Elysia API server (Bun)
│   └── worker/       # Video processing worker
├── packages/
│   ├── ui/           # Shared component library (shadcn/ui + CVA)
│   ├── typescript-config/
│   └── eslint-config/
├── docker/           # Dockerfiles (api, web)
└── docker-compose.yml
```

## Achievement

### Monorepo Setup
- Turborepo + pnpm workspaces สำหรับจัดการ apps/web, apps/api, apps/worker, packages/ui
- Shared TypeScript config และ ESLint config ข้าม workspace

### Shared UI Library
- packages/ui ใช้ shadcn/ui + Class Variance Authority (CVA) สำหรับ reusable components
- Radix UI primitives, Tailwind CSS 4, Zod validation

### API Server
- Elysia framework บน Bun runtime
- Auto-generated OpenAPI documentation
- CORS support, graceful shutdown (SIGINT/SIGTERM)
- Health check endpoint ที่ monitor PostgreSQL connection

### Database
- PostgreSQL 16 + Drizzle ORM พร้อม migration config
- Schema `videos` table ที่ track สถานะ video processing pipeline
- รองรับ field: title, rawPath, thumbnailPath, seekingPreviewPath, status, error messages

### Object Storage
- MinIO (S3-compatible) สำหรับเก็บ raw video และ processed assets
- แยก bucket: `raw` สำหรับ video ต้นฉบับ, `processed` สำหรับ thumbnail/preview

### Docker Compose
- Full stack containerization: PostgreSQL, MinIO, API, Web
- Multi-stage Dockerfile สำหรับ optimized production builds
- Volume management สำหรับ persistent data

### Smart Configuration
- Auto-detect Docker/local environment ผ่าน `/.dockerenv`
- `resolveContainerHostname` สำหรับ switch hostname อัตโนมัติระหว่าง container name กับ localhost

### Video Processing Pipeline (Design)

```
Upload → API → MinIO (raw bucket)
                  ↓
           RabbitMQ message
                  ↓
           Worker consumes
           ├── Generate thumbnail → MinIO (processed)
           └── Generate seeking preview → MinIO (processed)
                  ↓
           Update DB status (pending → completed/failed)
```

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm 9+
- Bun (for API server)
- Docker & Docker Compose

### Setup

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, MinIO)
docker compose up db minio -d

# Run database migration
cd apps/api && bunx drizzle-kit push

# Start development
pnpm dev
```

### Adding UI Components

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Components will be placed in `packages/ui/src/components/` and can be imported as:

```tsx
import { Button } from "@workspace/ui/components/button";
```
