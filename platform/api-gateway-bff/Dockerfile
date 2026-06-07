# Brain api-gateway-bff (NestJS). Build context = this directory.
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/main.js"]
