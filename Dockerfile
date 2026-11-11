FROM node:24-alpine

# curl is required by the image health check and by Coolify's HTTP healthcheck.
RUN apk add --no-cache curl

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/data/dong.db

WORKDIR /app

COPY package.json package-lock.json ./
COPY server ./server
COPY src ./src
COPY public ./public
COPY migrations ./migrations

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --fail http://localhost:3000/api/health || exit 1

CMD ["node", "server/server.mjs"]
