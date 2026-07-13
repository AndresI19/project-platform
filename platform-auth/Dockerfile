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
COPY package*.json ./
# Production deps only: this service holds a signing key, so every package that does not need to be
# in the image is one that cannot compromise it.
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8002
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
