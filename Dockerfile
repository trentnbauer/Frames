FROM node:20-bookworm-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-bookworm-slim AS server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data LIBRARY_DIRS=/library PORT=3000 WEB_DIR=/app/web
COPY --from=server /app/server/node_modules ./server/node_modules
COPY --from=server /app/server/dist ./server/dist
COPY --from=server /app/server/package.json ./server/package.json
COPY --from=web /app/web/dist ./web
USER node
WORKDIR /app/server
EXPOSE 3000
VOLUME /data
CMD ["node", "dist/index.js"]
