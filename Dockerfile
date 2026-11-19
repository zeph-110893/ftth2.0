# Production Dockerfile optimized for Alpine Linux on MikroTik RB5009 (ARM64 / aarch64)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code, build app + server bundle, and prune dev dependencies
COPY . .
RUN npm run build && npm prune --omit=dev

# Stage 2: Production Minimal Alpine Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/ftth_database.sqlite

# Create persistent storage folder
RUN mkdir -p /app/data

# Copy built artifacts and production dependencies only
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# SQLite database and system state will be permanently persisted in mounted volume /app/data
VOLUME ["/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.cjs"]
