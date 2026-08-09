FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/data

EXPOSE 4000

CMD ["npm", "run", "start"]
