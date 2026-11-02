# ---- build stage ----------------------------------------------------------
FROM node:24-bookworm-slim AS build

WORKDIR /app

# The release pipeline passes the package.json version. The default keeps
# plain `docker build` usable without an argument.
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=$APP_VERSION

# Install dependencies first for layer caching. The postinstall step removes
# the native SWC packages: this project builds with @next/swc-wasm-nodejs.
COPY package.json package-lock.json .npmrc ./
COPY scripts ./scripts
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs source.config.ts ./
COPY content ./content
COPY src ./src
COPY public ./public

# Build-time dummy values only. The runtime image receives the real secrets
# from the environment (docker compose env_file); nothing here is baked in.
ENV NODE_ENV=production \
    AUTH_SECRET="build-only-secret-never-used-at-runtime-000000000" \
    APP_URL="http://localhost:3000"

RUN npx prisma generate \
  && npm run build

# ---- runtime stage --------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

# PDFs are rendered with pdf-lib (pure JavaScript), so no browser is needed
# in the image. tini reaps signals; ca-certificates for outbound TLS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="file:/data/app.db" \
    UPLOAD_DIR="/data/uploads" \
    BACKUP_DIR="/backups" \
    PORT=3000

ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=$APP_VERSION
LABEL org.opencontainers.image.version=$APP_VERSION

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
# The standalone server looks for these two folders beside itself.
COPY --from=build /app/public ./.next/standalone/public
COPY --from=build /app/.next/static ./.next/standalone/.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/source.config.ts ./
COPY --from=build /app/content ./content
COPY --from=build /app/scripts ./scripts

# Non-root user. Drop the build cache: it is not needed at runtime and can be
# hundreds of megabytes. Only state, Next's runtime cache and Prisma's engine
# directory need to be writable; chowning all of node_modules adds minutes to
# every build.
RUN rm -rf /app/.next/cache \
  && mkdir -p /data/uploads /backups /app/.next/cache \
  && chown -R node:node /data /backups /app/node_modules/@prisma/engines \
  && chown node:node /app /app/.next /app/.next/cache \
  && if [ -d /app/node_modules/.cache ]; then chown -R node:node /app/node_modules/.cache; fi
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# tini reaps signals properly; migrations run on start, then the seed (which
# is idempotent: INSERT OR IGNORE everywhere and existence checks for the
# admin), so a fresh volume is immediately usable. ADMIN_PASSWORD sets the
# first admin's password; change it after the first sign-in.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/seed.mjs && node .next/standalone/server.js"]
