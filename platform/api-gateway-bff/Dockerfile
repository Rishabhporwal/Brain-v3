# Brain api-gateway-bff (NestJS). Build from the MONOREPO ROOT (pnpm workspace) — the BFF composes the
# @brain/connector-* workspace packages, so npm/single-package builds can't resolve `workspace:*`:
#   docker build -f platform/api-gateway-bff/Dockerfile -t brain-bff .
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
# `...` pulls in the BFF's workspace dependency closure (connector-kit + each connector).
RUN pnpm install --filter @brain/api-gateway-bff... --no-frozen-lockfile
# Builds the connector deps (tsc → dist) in topological order, then the BFF (nest build).
RUN pnpm --filter @brain/api-gateway-bff... build

FROM node:22-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production PORT=4000
# Keep the workspace layout intact so the BFF's `require('@brain/connector-*')` symlinks resolve to
# each connector's built dist/. Copying the whole tree preserves pnpm's node_modules symlinks.
COPY --from=build /repo .
EXPOSE 4000
CMD ["node", "platform/api-gateway-bff/dist/main.js"]
