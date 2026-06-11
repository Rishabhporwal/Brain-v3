# Brain metric-engine (NestJS). Build from the MONOREPO ROOT (pnpm workspace):
#   docker build -f customer-intelligence/consent/Dockerfile -t brain-consent .
# Money-moving service — Security co-sign on changes (CODEOWNERS).
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @brain/consent...
RUN pnpm -C customer-intelligence/consent build

FROM node:22-alpine
WORKDIR /repo
COPY --from=build /repo/customer-intelligence/consent/dist customer-intelligence/consent/dist
COPY --from=build /repo/customer-intelligence/consent/node_modules customer-intelligence/consent/node_modules
COPY --from=build /repo/node_modules node_modules
ENV NODE_ENV=production
EXPOSE 7083
CMD ["node", "customer-intelligence/consent/dist/main.js"]
