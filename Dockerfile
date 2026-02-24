FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY server.js contentModerator.js ./
COPY public/ ./public/

# Persist user data across container restarts
VOLUME ["/app/uploads", "/app/data"]

EXPOSE 3000

CMD ["node", "server.js"]
