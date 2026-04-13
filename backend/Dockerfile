# Pinned Alpine minor for fewer stale base CVEs; non-root limits breakout impact.
FROM node:20-alpine3.19

WORKDIR /app

RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app

# Dependencies first (better layer cache); reproducible install for CI/production.
COPY --chown=app:app package*.json ./
USER app
RUN npm ci --omit=dev

COPY --chown=app:app . .

# Container default (override with -e PORT=8080 etc.); HEALTHCHECK must match listen port.
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Node built-in HTTP client — no extra image packages (wget/curl).
# start-period allows DB connect + first listen; interval/timeout suit orchestrators.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const p=process.env.PORT||'5000';require('http').get('http://127.0.0.1:'+p+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
