# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the FF14 固定 Discord bot.
#
#   Stage 1 (deps):    install pnpm + native build tools (better-sqlite3 needs gcc/python)
#   Stage 2 (runtime): just Node + tsx + the bot source. Small Alpine image.
#
# Workspace deps (`@ff14kotei/db`, `@ff14kotei/schema`) ship as TS source
# (their package.json points main → src/index.ts), so we run with tsx at
# runtime — same path as `pnpm dev/start`, no separate compile step.
#
# Built from the repo root: `docker build -f apps/bot/Dockerfile .`
# Fly.io takes care of this automatically when `fly.toml` points to this file.

ARG NODE_VERSION=22-alpine
ARG PNPM_VERSION=11.3.0

# ── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Manifests first → install caches when only source changes
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/db/package.json ./packages/db/
COPY packages/schema/package.json ./packages/schema/

# tsx is a devDep but we need it at runtime to execute TS workspace sources.
# Keep dev deps in this stage; they're not bundled into the runtime image
# beyond what tsx itself needs.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @ff14kotei/bot...

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
# tini = PID 1 that forwards SIGTERM to our Node process for graceful shutdown
RUN apk add --no-cache libc6-compat tini

WORKDIR /app
ENV NODE_ENV=production
ENV HEALTH_PORT=8080
# Mounted volume in fly.toml lives at /data — keep SQLite + WAL files there.
ENV DATABASE_URL=/data/ff14kotei.db

# Copy node_modules (with tsx + native better-sqlite3 binary) and workspace sources.
# pnpm's isolated layout keeps each package's bins/symlinks in its OWN node_modules,
# so the per-package dirs must be copied too — otherwise tsx (a bot devDep) and the
# @ff14kotei/* workspace links are absent at runtime.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/schema/node_modules ./packages/schema/node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

COPY apps/bot/package.json ./apps/bot/package.json
COPY apps/bot/tsconfig.json ./apps/bot/tsconfig.json
COPY apps/bot/src ./apps/bot/src
COPY packages/db/package.json ./packages/db/package.json
COPY packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY packages/db/src ./packages/db/src
COPY packages/db/drizzle ./packages/db/drizzle
COPY packages/schema/package.json ./packages/schema/package.json
COPY packages/schema/tsconfig.json ./packages/schema/tsconfig.json
COPY packages/schema/src ./packages/schema/src
COPY data ./data

ENTRYPOINT ["/sbin/tini", "--"]
WORKDIR /app/apps/bot
EXPOSE 8080
CMD ["node", "--enable-source-maps", "node_modules/.bin/tsx", "src/index.ts"]
