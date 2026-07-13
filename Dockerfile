# Multi-stage: build the Vite client, then serve dist/ with the small Express server.
#
# The shared @platform/ui package lives INSIDE this repo (packages/platform-ui — this repo is its
# source of truth), so the build context is self-contained and `docker build .` works with no flags.
# It used to be a sibling directory passed in as a named build context, which meant the image could
# not be built from a fresh clone.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# The lockfile resolves @platform/ui to file:packages/platform-ui, so the package has to be present
# before `npm ci` runs.
COPY package*.json ./
COPY packages ./packages
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
COPY packages ./packages
# The server runs via tsx (a devDependency), so keep dev deps even under NODE_ENV=production.
RUN npm ci --include=dev
COPY --from=build /app/dist ./dist
COPY src ./src
COPY tsconfig.json ./
EXPOSE 3000
CMD ["npm", "start"]
