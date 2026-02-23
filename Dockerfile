# ─── Stage 1: Build ─────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Find the actual standalone root (Next.js may nest it under workspace path)
RUN STANDALONE_ROOT=$(find .next/standalone -name "server.js" -not -path "*/node_modules/*" -exec dirname {} \; | head -1) && \
    mkdir -p /standalone && \
    cp -r "$STANDALONE_ROOT"/. /standalone/

# ─── Stage 2: Production ────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

# Install ffprobe (from distro — works for both amd64 and arm64)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Copy standalone output from known location
COPY --from=builder /standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Data directory (mount a volume here for persistence)
RUN mkdir -p /data
ENV KUBBY_DATA_DIR=/data
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV AUTH_TRUST_HOST=true
ENV KUBBY_DOCKER=1

EXPOSE 3000

# Generate AUTH_SECRET on first run if not provided via env
CMD if [ -z "$AUTH_SECRET" ]; then \
      if [ -f /data/auth-secret ]; then \
        export AUTH_SECRET=$(cat /data/auth-secret); \
      else \
        export AUTH_SECRET=$(head -c 32 /dev/urandom | xxd -p | tr -d '\n'); \
        echo "$AUTH_SECRET" > /data/auth-secret; \
      fi; \
    fi && \
    node server.js
