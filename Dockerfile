FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

EXPOSE 3000 50051

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=5 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "src/server.js"]
