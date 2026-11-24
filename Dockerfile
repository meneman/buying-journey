# Stage 1: Build Frontend
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
ARG VITE_SUPABASE_URL=https://epknwdxauctkdcwpsslh.supabase.co
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# Stage 2: Production Server
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Install curl & CA certificates (HEALTHCHECK + HTTPS calls e.g. Supabase/remote-ai)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/app.db
ENV FRONTEND_DIST=/app/frontend/dist

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/config || exit 1

CMD ["node", "src/web/backend/server.js"]
