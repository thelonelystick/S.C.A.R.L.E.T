# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY migrations ./migrations
COPY tsconfig.json next-env.d.ts next.config.mjs postcss.config.cjs tailwind.config.cjs .eslintrc.cjs ./
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/opt/scarlet-browsers
COPY --from=build /app/node_modules ./node_modules
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json /app/tsconfig.json /app/next.config.mjs ./
RUN test -s lib/extractors/pdf.cjs && test -s .next/BUILD_ID && mkdir -p .next/cache && chown node:node .next/cache
COPY --chmod=755 <<'SH' /usr/local/bin/scarlet-env
#!/bin/sh
set -eu
# Compose generates these passwords as hex. Hosted deployments can supply complete URLs directly.
if [ -f /run/secrets/pg_app_password ]; then
  pg_pass=$(cat /run/secrets/pg_app_password)
  case "$pg_pass" in ""|*[!a-fA-F0-9]*) echo "Invalid PostgreSQL password format" >&2; exit 64;; esac
  export DATABASE_URL="postgresql://scarlet_app:${pg_pass}@db:5432/scarlet"
fi
if [ -f /run/secrets/pg_migration_password ]; then
  migration_pass=$(cat /run/secrets/pg_migration_password)
  case "$migration_pass" in ""|*[!a-fA-F0-9]*) echo "Invalid migration password format" >&2; exit 64;; esac
  export DATABASE_URL="postgresql://scarlet_migrator:${migration_pass}@db:5432/scarlet"
fi
if [ -f /run/secrets/redis_password ]; then
  redis_pass=$(cat /run/secrets/redis_password)
  case "$redis_pass" in ""|*[!a-fA-F0-9]*) echo "Invalid Redis password format" >&2; exit 64;; esac
  export REDIS_URL="redis://:${redis_pass}@redis:6379/0"
fi
if [ -f /run/secrets/master_key ]; then
  SCARLET_MASTER_KEY=$(cat /run/secrets/master_key)
  export SCARLET_MASTER_KEY
fi
exec "$@"
SH
USER node
ENTRYPOINT ["/usr/local/bin/scarlet-env"]
EXPOSE 3000
CMD ["node","node_modules/next/dist/bin/next","start","-H","0.0.0.0","-p","3000"]

FROM app AS worker
USER root
# The locally locked Playwright CLI chooses its matching Linux Chromium revision.
RUN node node_modules/playwright-core/cli.js install --with-deps chromium && chmod -R a+rX /opt/scarlet-browsers && rm -rf /var/lib/apt/lists/*
USER node
CMD ["node","--env-file-if-exists=.env","--import","tsx","scripts/worker.ts"]
