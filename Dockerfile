# syntax=docker/dockerfile:1
# Multi-stage build: compilers and dev dependencies never reach the runtime image.

FROM node:22-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx nest build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    FILE_STORAGE_DIR=/app/storage
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
RUN mkdir -p /app/storage && chown node:node /app/storage && chmod 700 /app/storage
USER node
EXPOSE 3000
# 1) apply committed migrations (never reset), 2) optional demo data (staging
# only, guarded by DEMO_SEED + NODE_ENV), 3) start the API.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/prisma/seed-demo.js && node dist/src/main.js"]
