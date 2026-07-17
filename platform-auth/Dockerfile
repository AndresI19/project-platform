# The entrypoint migrates before it serves, so a fresh database is usable on first boot. Migrations
# are idempotent (CREATE ... IF NOT EXISTS), which is what makes running them on every start safe.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Cache-bust the source copy and build on every commit. The run stage stamps VERSION and the revision
# label from build-args, independently of what this stage compiled — so a reused build-stage layer
# would ship OLD code under a FRESH version and revision, an image that labels itself correct while
# running the previous release (this happened to home at 0.1.42). Referencing GIT_SHA in a RUN here
# ties the source layer's cache key to the commit; npm ci above stays cached.
ARG GIT_SHA
RUN echo "build stage source commit: ${GIT_SHA:-unknown}"
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8002

# Version, stamped by k8s/deploy.sh — an OCI label so the image is identifiable without running it,
# and a VERSION file so the service can serve it from /version. Unset (a bare `docker build`) writes
# an empty file and the server reports "snapshot"; a dev build must not claim to be a release.
ARG VERSION
ARG GIT_SHA
ARG BUILD_DATE
LABEL org.opencontainers.image.title="platform-auth" \
      org.opencontainers.image.description="Identity service — issues and signs platform tokens" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"
RUN printf '%s' "${VERSION}" > /app/VERSION
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
