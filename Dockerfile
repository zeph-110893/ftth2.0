# Production Dockerfile optimized for Alpine Linux on MikroTik RB5009 (ARM64 / aarch64)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code and build app + server bundle
COPY . .
RUN npm run build

# Stage 2: Production Minimal Alpine Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/ftth_database.sqlite

# Create persistent storage folder
RUN mkdir -p /app/data

# Copy built artifacts and dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# SQLite database and system state will be permanently persisted in mounted volume /app/data
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
