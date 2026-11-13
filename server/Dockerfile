FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=5000 \
  MONGODB_URI=mongodb://mongodb:27017/boardgamevn \
    PYTHON_BIN=python3

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY package.json package-lock.json /app/
COPY server/package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node server/ ./
COPY --chown=node:node py/ /app/py/

USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "index.js"]