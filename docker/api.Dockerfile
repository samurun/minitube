FROM oven/bun:1-alpine

WORKDIR /app

COPY apps/api/package.json ./package.json
COPY apps/api/tsconfig.json ./tsconfig.json
RUN bun install

COPY apps/api/src ./src

EXPOSE 4000

CMD ["bun", "run", "src/index.ts"]