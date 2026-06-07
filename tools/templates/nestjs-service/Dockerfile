# Multi-stage NestJS build. pnpm workspace-aware; build deps in builder, slim runtime.
FROM node:24-slim AS builder
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @brain/SERVICE_NAME build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/SERVICE_PATH/dist ./dist
COPY --from=builder /repo/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/main.js"]
