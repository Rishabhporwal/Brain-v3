# Brain raw-archiver. Build from the MONOREPO ROOT (pnpm workspace):
#   docker build -f data-platform/raw-archiver/Dockerfile -t brain-raw-archiver .
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @brain/raw-archiver...
RUN pnpm -C data-platform/raw-archiver build

FROM node:22-alpine
WORKDIR /repo
COPY --from=build /repo/data-platform/raw-archiver/dist data-platform/raw-archiver/dist
COPY --from=build /repo/data-platform/raw-archiver/node_modules data-platform/raw-archiver/node_modules
COPY --from=build /repo/node_modules node_modules
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "data-platform/raw-archiver/dist/main.js"]
