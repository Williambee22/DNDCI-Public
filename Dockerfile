FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js storage.js game-engine.js ./
COPY public ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    COOKIE_SECURE=1

EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" >/dev/null || exit 1

CMD ["node", "server.js"]
