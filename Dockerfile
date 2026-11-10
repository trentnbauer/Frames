# cloudflared, for the optional Cloudflare tunnel (Settings, Cloudflare tunnel). Pinned; Dependabot proposes bumps.
FROM cloudflare/cloudflared:2026.10.7 AS cloudflared

FROM node:22-bookworm-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ARG VERSION=dev
ENV APP_VERSION=$VERSION NODE_ENV=production DATA_DIR=/data LIBRARY_DIRS=/library PORT=3000 HOST=0.0.0.0 WEB_DIR=/app/web
COPY --from=server /app/server/node_modules ./server/node_modules
COPY --from=server /app/server/dist ./server/dist
COPY --from=server /app/server/package.json ./server/package.json
COPY --from=web /app/web/dist ./web
COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared
# RAW files: ExifTool finds the JPEG preview each camera maker embeds (and reads their metadata), and
# dcraw develops a RAW that has no usable preview. Both only read the file.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libimage-exiftool-perl dcraw \
 && rm -rf /var/lib/apt/lists/*
# The app runs as the unprivileged "node" user, so it must own the data folder
# (a fresh named volume copies this ownership).
RUN mkdir -p /data /library /backups && chown node:node /data /backups
USER node
WORKDIR /app/server
EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
