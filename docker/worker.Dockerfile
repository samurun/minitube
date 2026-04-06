FROM oven/bun:1-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

# Minimal root package.json with workspaces so bun can resolve workspace:* deps
RUN echo '{"name":"minitube","private":true,"workspaces":["apps/*","packages/*"]}' > package.json

# Copy only the workspace packages needed at runtime
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/worker/package.json ./apps/worker/package.json

RUN bun install

# Copy only what worker actually needs at runtime
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY apps/worker/src ./apps/worker/src
COPY apps/worker/tsconfig.json ./apps/worker/tsconfig.json

WORKDIR /app/apps/worker
CMD ["bun", "run", "src/index.ts"]
