# Multi-stage: build the Vite client, then serve dist/ with the tiny Express server.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
RUN npm ci
COPY --from=build /app/dist ./dist
COPY src ./src
COPY tsconfig.json ./
EXPOSE 3000
CMD ["npm", "start"]
