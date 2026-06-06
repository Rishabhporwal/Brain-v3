# Brain Founder Console — production image. Build from the MONOREPO ROOT:
#   docker build -f apps/web-founder-console/Dockerfile -t brain-web .
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --filter @brain/web-founder-console... --no-frozen-lockfile

# NEXT_PUBLIC_* are inlined at build time — pass via --build-arg to retarget the BFF/app URLs.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_AI_NAME=Brain
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_AI_NAME=$NEXT_PUBLIC_AI_NAME \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @brain/web-founder-console build

FROM node:22-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Next standalone (monorepo) output: server + traced node_modules under the workspace path.
COPY --from=build /repo/apps/web-founder-console/.next/standalone ./
COPY --from=build /repo/apps/web-founder-console/.next/static ./apps/web-founder-console/.next/static
COPY --from=build /repo/apps/web-founder-console/public ./apps/web-founder-console/public
EXPOSE 3000
CMD ["node", "apps/web-founder-console/server.js"]
