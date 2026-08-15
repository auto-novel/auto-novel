FROM node:25-bookworm AS builder

RUN npm install -g corepack@latest --force && corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY daemon/package.json ./daemon/package.json
COPY packages/crawler/package.json ./packages/crawler/package.json

RUN pnpm install --frozen-lockfile

COPY daemon ./daemon
COPY packages/crawler ./packages/crawler

RUN pnpm --filter @auto-novel/crawler build
RUN pnpm --filter @auto-novel/daemon build
RUN pnpm --filter @auto-novel/daemon --legacy deploy --prod /app

FROM node:25 AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app ./

ENV CONFIG_PATH=/app/config.json
CMD ["node", "dist/app.js"]
