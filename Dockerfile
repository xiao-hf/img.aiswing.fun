FROM node:22-alpine

WORKDIR /app
RUN apk add --no-cache git python3 make g++
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    UPSTREAM=https://cdn.aiswing.fun \
    MAX_BODY_BYTES=62914560 \
    DATA_DIR=/app/data \
    SQLITE_PATH=/app/data/aiswing.sqlite \
    TASK_TTL_HOURS=48 \
    WORKER_CONCURRENCY=1 \
    CLEANUP_INTERVAL_MINUTES=10

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .
RUN node --check server.js

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
