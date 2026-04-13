# Stage 1: build the app
FROM node:25-bookworm AS builder

RUN npm install -g corepack@latest --force && corepack enable

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

RUN CI=true pnpm prune --prod

# Stage 2: Runner
FROM node:25 AS runner

WORKDIR /app

ENV NODE_ENV=production

# USER node

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./

ENV CONFIG_PATH=/app/config.json
CMD ["node", "dist/app.js"]
