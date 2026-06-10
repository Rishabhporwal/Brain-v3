# Brain metric-engine (NestJS). Build from the MONOREPO ROOT (pnpm workspace):
#   docker build -f commerce-intelligence/metric-engine/Dockerfile -t brain-metric-engine .
# The image carries contracts/metrics/registry.yaml — the engine refuses to boot without its formula book.
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @brain/metric-engine...
RUN pnpm -C commerce-intelligence/metric-engine build

FROM node:22-alpine
WORKDIR /repo
COPY --from=build /repo/commerce-intelligence/metric-engine/dist commerce-intelligence/metric-engine/dist
COPY --from=build /repo/commerce-intelligence/metric-engine/node_modules commerce-intelligence/metric-engine/node_modules
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/contracts/metrics contracts/metrics
ENV NODE_ENV=production
EXPOSE 7080
CMD ["node", "commerce-intelligence/metric-engine/dist/main.js"]
