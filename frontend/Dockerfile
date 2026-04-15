# Build with full devDependencies; serve static files as non-root (bookworm-slim for scanner-friendly base).
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 app && useradd --uid 1001 --gid app --shell /usr/sbin/nologin --create-home app \
  && npm install -g serve@14 \
  && npm cache clean --force

COPY --from=build --chown=app:app /app/dist ./dist

USER app

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["serve", "-s", "dist", "-l", "3000"]
