# Pinned Node + Alpine minor for fewer stale OS CVEs than floating tags; rebuild periodically.
# Re-pull or pin digest after `docker pull node:20-alpine3.21` for reproducible scans.
FROM node:20-alpine3.21

RUN apk add --no-cache ca-certificates \
  && addgroup -g 1001 -S app && adduser -S -u 1001 -G app app

WORKDIR /app

COPY --chown=app:app package*.json ./
USER app
RUN npm ci --omit=dev

COPY --chown=app:app . .

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const p=process.env.PORT||'5000';require('http').get('http://127.0.0.1:'+p+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
