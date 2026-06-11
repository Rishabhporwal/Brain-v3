# Brain metric-engine (NestJS). Build from the MONOREPO ROOT (pnpm workspace):
#   docker build -f commerce-intelligence/realized-revenue-ledger/Dockerfile -t brain-revenue-ledger .
# The financial golden record service — reconciliation job + ledger API.
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @brain/realized-revenue-ledger...
RUN pnpm -C commerce-intelligence/realized-revenue-ledger build

FROM node:22-alpine
WORKDIR /repo
COPY --from=build /repo/commerce-intelligence/realized-revenue-ledger/dist commerce-intelligence/realized-revenue-ledger/dist
COPY --from=build /repo/commerce-intelligence/realized-revenue-ledger/node_modules commerce-intelligence/realized-revenue-ledger/node_modules
COPY --from=build /repo/node_modules node_modules
ENV NODE_ENV=production
EXPOSE 7082
CMD ["node", "commerce-intelligence/realized-revenue-ledger/dist/main.js"]
