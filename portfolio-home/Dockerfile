# Multi-stage: build the Vite client and bundle the Express server into ONE self-contained file, then
# ship both on an apt-patched slim base with no npm and no node_modules at all.
#
# The server used to run via tsx (a devDependency) straight from src/, which forced the runtime image
# to carry every dev dependency. Instead the build now esbuild-bundles src/server into dist/server.mjs
# with everything inlined (Express, @platform/ui, the lot), so the runtime needs nothing but the node
# binary and the bundle. That collapses the vulnerability surface to node + the OS packages.
#
# Slim rather than distroless ON PURPOSE: distroless has no package manager, so it cannot pick up the
# OS security fixes (a recent libssl3 CRITICAL, among others). Slim + `apt-get upgrade` can, and then
# npm is stripped so the toolchain's CVEs do not ship either.
#
# The shared @platform/ui package lives INSIDE this repo (packages/platform-ui — this repo is its
# source of truth), so `docker build .` works with no flags.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# The lockfile resolves @platform/ui to file:packages/platform-ui, so the package has to be present
# before `npm ci` runs.
COPY package*.json ./
COPY packages ./packages
RUN npm ci
COPY . .
# Vite builds the client into dist/client; esbuild bundles the server into dist/server.mjs. ESM (not
# CJS) so `import.meta.url` — which serveClient uses to locate dist/client — resolves natively; the
# createRequire banner lets the bundled CJS deps' `require('path')` calls work under ESM.
# Output the bundle at dist/server/index.mjs — the SAME depth below the app root as the original
# src/server/index.ts, so the server's own `resolve(__dirname, '../..')` still lands on the app root
# and finds dist/client. No code change needed; just the matching path.
RUN npm run build \
    && npx esbuild src/server/index.ts --bundle --platform=node --format=esm \
       --banner:js='import{createRequire}from"module";const require=createRequire(import.meta.url);' \
       --outfile=dist/server/index.mjs

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Version, stamped by k8s/deploy.sh. It goes two places on purpose: an OCI label, so the image can be
# identified without running it, and a VERSION file, so the running server can serve it from /version
# without the version having to become an environment variable in the manifest. Unset (a bare
# `docker build`) writes an empty file, and the server falls back to "snapshot" — a dev build should
# never claim to be a release.
ARG VERSION
ARG GIT_SHA
ARG BUILD_DATE
LABEL org.opencontainers.image.title="portfolio-home" \
      org.opencontainers.image.description="Personal home page + project index" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"
RUN printf '%s' "${VERSION}" > /app/VERSION
# Patch the OS, then strip npm (the runtime only ever runs `node`): both are pure CVE surface here.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
# The whole runtime: the client bundle, its assets, and the self-contained server. No node_modules.
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server/index.mjs"]
