FROM oven/bun:1

# ffmpeg for HLS transcoding; coreutils supplies `stdbuf` for line-buffered
# stderr so progress output arrives in real time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg coreutils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Minimal root package.json with workspaces so bun can resolve workspace:* deps
RUN echo '{"name":"minitube","private":true,"workspaces":["apps/*","packages/*"]}' > package.json

# Copy only the workspace packages needed at runtime
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/worker-core/package.json ./packages/worker-core/package.json
COPY apps/worker-transcode/package.json ./apps/worker-transcode/package.json

RUN bun install

# Copy source
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/worker-core/src ./packages/worker-core/src
COPY packages/worker-core/tsconfig.json ./packages/worker-core/tsconfig.json
COPY apps/worker-transcode/src ./apps/worker-transcode/src
COPY apps/worker-transcode/tsconfig.json ./apps/worker-transcode/tsconfig.json

WORKDIR /app/apps/worker-transcode
CMD ["bun", "run", "src/index.ts"]
