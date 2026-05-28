# ─── Builder ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
# postinstall runs `prisma generate`, which loads prisma.config.ts and eagerly
# resolves env("DATABASE_URL"). No DB is contacted during generate, so a
# throwaway URL satisfies the config without a real connection.
RUN DATABASE_URL=postgresql://x:x@localhost/x npm ci

COPY . .
RUN npm run build

# ─── Runner ───────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install production deps (prisma CLI + full transitive tree) before copying
# the standalone bundle — npm ci wipes node_modules, so order matters.
COPY package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
RUN DATABASE_URL=postgresql://x:x@localhost/x npm ci --omit=dev

# Standalone Next.js bundle (merges its bundled server deps on top)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
