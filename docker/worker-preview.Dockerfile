FROM oven/bun:1

# ffmpeg for video processing; coreutils supplies `stdbuf` (only works on
# glibc — musl/alpine silently no-ops) to force ffmpeg's stderr to be
# line-buffered so progress output arrives in real time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg coreutils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Minimal root package.json with workspaces so bun can resolve workspace:* deps
RUN echo '{"name":"minitube","private":true,"workspaces":["apps/*","packages/*"]}' > package.json

# Copy only the workspace packages needed at runtime
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/worker-core/package.json ./packages/worker-core/package.json
COPY apps/worker-preview/package.json ./apps/worker-preview/package.json

RUN bun install

# Copy source
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/worker-core/src ./packages/worker-core/src
COPY packages/worker-core/tsconfig.json ./packages/worker-core/tsconfig.json
COPY apps/worker-preview/src ./apps/worker-preview/src
COPY apps/worker-preview/tsconfig.json ./apps/worker-preview/tsconfig.json

WORKDIR /app/apps/worker-preview
CMD ["bun", "run", "src/index.ts"]
