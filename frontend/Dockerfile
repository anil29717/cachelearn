# Same base as backend (node:20-alpine3.21) so one update path and comparable CVE posture vs bookworm-slim.
FROM node:20-alpine3.21 AS build
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine3.21
WORKDIR /app
RUN apk add --no-cache ca-certificates \
  && addgroup -g 1001 -S app && adduser -S -u 1001 -G app app \
  && npm install -g serve@14 \
  && npm cache clean --force

COPY --from=build --chown=app:app /app/dist ./dist

USER app

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["serve", "-s", "dist", "-l", "3000"]
