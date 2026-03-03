# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Install deps first (layer cache)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
# Build TypeScript → dist/
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Compiled output
COPY --from=builder /app/dist ./dist

# Run migrations then start
# (ts-node not needed in prod — we run compiled JS)
EXPOSE 3501

CMD ["node", "dist/index.js"]
