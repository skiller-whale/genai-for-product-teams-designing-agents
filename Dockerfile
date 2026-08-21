# Builds and serves the Agent Workbench on a single port (3000) for the
# Skiller Whale hosted environment. The Hono server serves the built Vite
# frontend and the /api routes together, so no dev server / proxy is needed.
FROM oven/bun:1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the frontend (outputs to dist/client).
COPY . .
RUN bun run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/server/index.ts"]
