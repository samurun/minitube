FROM oven/bun:1-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

# Minimal root package.json with workspaces so bun can resolve workspace:* deps
RUN echo '{"name":"minitube","private":true,"workspaces":["apps/*","packages/*"]}' > package.json

# Copy only the workspace packages needed at runtime
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/worker-core/package.json ./packages/worker-core/package.json
COPY apps/worker-thumbnail/package.json ./apps/worker-thumbnail/package.json

RUN bun install

# Copy source
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/worker-core/src ./packages/worker-core/src
COPY packages/worker-core/tsconfig.json ./packages/worker-core/tsconfig.json
COPY apps/worker-thumbnail/src ./apps/worker-thumbnail/src
COPY apps/worker-thumbnail/tsconfig.json ./apps/worker-thumbnail/tsconfig.json

WORKDIR /app/apps/worker-thumbnail
CMD ["bun", "run", "src/index.ts"]
