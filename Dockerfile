# Kale Taşıma: tek süreç, tek port (statik dosyalar + WebSocket). Derleme adımı yok.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# Bağımlılıklar önce: kaynak değişince bu katman önbellekten gelir (three.js /vendor/ yolundan buradan sunulur).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server.mjs game.js index.html style.css ./
COPY server ./server
COPY src ./src

ENV HOST=0.0.0.0 PORT=5185
EXPOSE 5185
USER node

HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5185/health >/dev/null || exit 1

CMD ["node", "server.mjs"]
