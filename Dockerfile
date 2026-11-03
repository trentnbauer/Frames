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
# The app runs as the unprivileged "node" user, so it must own the data folder
# (a fresh named volume copies this ownership).
RUN mkdir -p /data /library && chown node:node /data
USER node
WORKDIR /app/server
EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
