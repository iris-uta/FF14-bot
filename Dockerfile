# syntax=docker/dockerfile:1
# Multi-stage Docker build for @ff14kotei/bot
# Runs the bot via tsx (no separate compile step needed for ESM monorepo).

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

# ─── Dependencies stage ────────────────────────────────────────────
FROM base AS deps
# Native build tools for better-sqlite3 compile
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy lockfile + workspace manifests for cached install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot/package.json apps/bot/
COPY packages/schema/package.json packages/schema/
COPY packages/db/package.json packages/db/

# Install all deps (need devDeps too for tsx runtime)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ─── Runtime stage ─────────────────────────────────────────────────
FROM base AS runtime

# Copy installed deps from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=deps /app/packages/schema/node_modules ./packages/schema/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

# Copy source code
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot apps/bot
COPY packages/schema packages/schema
COPY packages/db packages/db
COPY data data

WORKDIR /app/apps/bot
CMD ["pnpm", "start"]
