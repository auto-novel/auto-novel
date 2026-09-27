FROM node:25-bookworm AS deps
RUN npm install -g corepack@latest --force && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/crawler/package.json ./packages/crawler/
COPY daemon/package.json ./daemon/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @auto-novel/daemon...

FROM deps AS builder
COPY packages/crawler/ ./packages/crawler/
COPY daemon/ ./daemon/
RUN pnpm --filter @auto-novel/daemon... build
RUN pnpm --filter @auto-novel/daemon deploy --prod --legacy /out

FROM node:25-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV CONFIG_PATH=/app/config.json
COPY --from=builder /out/ ./
CMD ["node", "dist/app.js"]
