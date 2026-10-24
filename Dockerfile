# syntax=docker/dockerfile:1
#
# Deckwarden as one container: Next's standalone server (`output: "standalone"`,
# next.config.ts) on Node 22. Coolify builds it on the box from `main`; the
# move, the settings and the measurements are EXIT-RUNBOOK.md.
#
# Build (from the repo root; the secrets are files outside the repo or
# variables in the shell, never build args):
#   docker build \
#     --secret id=DATABASE_URL,env=DATABASE_URL \
#     --secret id=BETTER_AUTH_SECRET,env=BETTER_AUTH_SECRET \
#     --secret id=DISCORD_CLIENT_ID,env=DISCORD_CLIENT_ID \
#     --secret id=DISCORD_CLIENT_SECRET,env=DISCORD_CLIENT_SECRET \
#     --secret id=GOOGLE_CLIENT_ID,env=GOOGLE_CLIENT_ID \
#     --secret id=GOOGLE_CLIENT_SECRET,env=GOOGLE_CLIENT_SECRET \
#     -t deckwarden .
# Run (the same values at runtime, plus whatever else .env.example lists):
#   docker run --env-file <file outside the repo> -p 3000:3000 deckwarden

# glibc, not alpine: sharp (the preview JPEG encode, src/lib/og/jpeg.ts) ships
# prebuilt linux-x64 and linux-arm64 glibc binaries that pnpm installs for the
# build's own architecture, so the image builds on an x86 or an Arm box alike.
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm at the version package.json pins (`packageManager`).
RUN corepack enable

# Dependencies first, so a source-only change reuses this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=deckwarden-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

COPY . .

# Public values are inlined into the client bundle and the CSP at build time
# (next.config.ts), so they are build inputs; each may also arrive as a
# secret of the same name (Coolify's BuildKit-secrets mode sends every build
# variable that way), which the mounts below read first.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE

# `next build` prerenders the ISR pages against DATABASE_URL, and loading
# src/lib/auth.ts requires the five auth variables (requireEnv throws at
# module load, so a deploy missing one fails here by name). BuildKit secrets
# exist for this RUN only: never in a layer, the image's history or its
# config, which is where ARG and ENV values end up.
RUN --mount=type=secret,id=DATABASE_URL,env=DATABASE_URL \
    --mount=type=secret,id=BETTER_AUTH_SECRET,env=BETTER_AUTH_SECRET \
    --mount=type=secret,id=DISCORD_CLIENT_ID,env=DISCORD_CLIENT_ID \
    --mount=type=secret,id=DISCORD_CLIENT_SECRET,env=DISCORD_CLIENT_SECRET \
    --mount=type=secret,id=GOOGLE_CLIENT_ID,env=GOOGLE_CLIENT_ID \
    --mount=type=secret,id=GOOGLE_CLIENT_SECRET,env=GOOGLE_CLIENT_SECRET \
    --mount=type=secret,id=NEXT_PUBLIC_SENTRY_DSN,env=NEXT_PUBLIC_SENTRY_DSN \
    --mount=type=secret,id=NEXT_PUBLIC_SITE_URL,env=NEXT_PUBLIC_SITE_URL \
    --mount=type=secret,id=NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE,env=NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE \
    pnpm build

FROM ${NODE_IMAGE} AS runner
# The standalone root. The preview fonts are read from
# `process.cwd()/assets/fonts` (src/lib/og/fonts.ts), traced there by the
# build; server.js chdirs to its own directory before anything else runs, so
# the fonts load whatever directory the container starts in.
WORKDIR /app
# server.js reads PORT and HOSTNAME. Docker sets HOSTNAME to the container's
# id, so it is pinned here: all interfaces, where Traefik reaches it on the
# box (and `docker run -p` locally; the box publishes no port, the runbook's
# header-trust decision).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# The traced server, then the two folders the standalone output leaves out
# (Next's output docs): the hashed assets and public/. Owned by the runtime
# user because the ISR pages regenerate into .next at runtime.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# Liveness without a database statement: a static file proves the process
# answers. /api/health runs `select 1` per call, and a probe every 30 s would
# keep Neon's compute from ever suspending (EXIT-RUNBOOK.md, the health-check
# decision). Coolify uses an image's HEALTHCHECK in place of its own and waits
# for it before retiring the old container; the image has no curl or wget, so
# the probe is Node's own fetch. The 2 s start interval lets a fresh container
# turn healthy within seconds instead of after the first 30 s interval.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/icon-192.png').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "server.js"]
