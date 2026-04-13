# Build: full devDependencies for Vite; runtime: static files only, non-root.
FROM node:20-alpine3.19 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine3.19
WORKDIR /app

RUN addgroup -g 1001 -S app \
  && adduser -S -u 1001 -G app app \
  && npm install -g serve@14

COPY --from=build --chown=app:app /app/dist ./dist

USER app

# Match HEALTHCHECK and scanner expectations; override with -e if you map another host port.
ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["serve", "-s", "dist", "-l", "3000"]
