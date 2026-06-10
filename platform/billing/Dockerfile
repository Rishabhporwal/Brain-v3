# Brain metric-engine (NestJS). Build from the MONOREPO ROOT (pnpm workspace):
#   docker build -f platform/billing/Dockerfile -t brain-billing .
# Money-moving service — Security co-sign on changes (CODEOWNERS).
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @brain/billing...
RUN pnpm -C platform/billing build

FROM node:22-alpine
WORKDIR /repo
COPY --from=build /repo/platform/billing/dist platform/billing/dist
COPY --from=build /repo/platform/billing/node_modules platform/billing/node_modules
COPY --from=build /repo/node_modules node_modules
ENV NODE_ENV=production
EXPOSE 7081
CMD ["node", "platform/billing/dist/main.js"]
