# The entrypoint migrates before it serves, so a fresh database is usable on first boot. Migrations
# are idempotent (CREATE ... IF NOT EXISTS), which is what makes running them on every start safe.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8002
# Patch the base OS, then remove the package manager: the runtime runs `node`, never npm, so npm and
# its large bundled node_modules (a recurring source of HIGH/CRITICAL CVEs — sigstore, etc.) have no
# business shipping in the image. Installed prod deps first, since removing npm happens after.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# Production deps only: this service holds a signing key, so every package that does not need to be
# in the image is one that cannot compromise it.
RUN npm ci --omit=dev && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/dist ./dist
EXPOSE 8002
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
