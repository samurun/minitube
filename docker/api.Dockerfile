FROM oven/bun:1-alpine

WORKDIR /app

# Minimal root package.json with workspaces so bun can resolve workspace:* deps
RUN echo '{"name":"minitube","private":true,"workspaces":["apps/*","packages/*"]}' > package.json

# Copy only the workspace packages needed at runtime
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json

RUN bun install

# Copy only what API actually needs at runtime
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]
