FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server

ENV NODE_ENV=production PORT=8787 ROOMMUSE_DATA_DIR=/var/lib/roommuse
EXPOSE 8787
CMD ["node", "server/server.mjs"]

