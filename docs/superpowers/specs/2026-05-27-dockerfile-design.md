# Dockerfile & Docker Compose — Self-Contained Deployment

**Date:** 2026-05-27
**Branch:** feat/dockerfile
**Goal:** Add a multi-stage Dockerfile and update docker-compose so `docker compose up` brings up the full stack (Postgres + app) with migrations applied automatically.

---

## Architecture

Two-stage Docker build (Option B — multi-stage standalone):

| Stage | Base | Purpose |
|-------|------|---------|
| `builder` | `node:20-alpine` | Install deps, generate Prisma client, build Next.js with standalone output |
| `runner` | `node:20-alpine` | Lean runtime image — standalone bundle + Prisma CLI for migrations |

The final image contains no `node_modules` except the selective copy Next.js standalone produces plus the Prisma CLI bits needed to apply migrations.

---

## Files Changed / Added

### `Dockerfile` (new)

**Builder stage:**
- `WORKDIR /app`
- Copy `package*.json` → `npm ci` (triggers `postinstall` → `prisma generate`)
- Copy source
- `RUN npm run build` — produces `.next/standalone/`

**Runner stage:**
- `WORKDIR /app`
- `ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0`
- Copy from builder:
  - `.next/standalone` → `./`
  - `.next/static` → `.next/static`
  - `public/` → `public/`
  - `prisma/` → `prisma/` (schema + migrations)
  - `prisma.config.ts` → `prisma.config.ts`
  - `node_modules/prisma` → `node_modules/prisma` (CLI)
  - `node_modules/.bin/prisma` → `node_modules/.bin/prisma`
  - `node_modules/dotenv` → `node_modules/dotenv` (required by prisma.config.ts)
  - `node_modules/jiti` → `node_modules/jiti` (required by Prisma to load prisma.config.ts)
- Copy `docker-entrypoint.sh` → `./docker-entrypoint.sh`
- `RUN chmod +x docker-entrypoint.sh`
- `EXPOSE 3000`
- `ENTRYPOINT ["./docker-entrypoint.sh"]`

### `docker-entrypoint.sh` (new)

```sh
#!/bin/sh
set -e
node_modules/.bin/prisma migrate deploy
exec node server.js
```

Runs `prisma migrate deploy` (idempotent — safe on every restart), then hands off to the standalone server.

### `next.config.ts` (updated)

Add `output: "standalone"` to `nextConfig` alongside the existing `turbopack.root`.

### `docker-compose.yml` (updated)

Add `app` service:

```yaml
app:
  build: .
  ports:
    - "3000:3000"
  depends_on:
    db:
      condition: service_healthy
  env_file: .env
  environment:
    DATABASE_URL: postgresql://postgres:postgres@db:5432/dcc?schema=public
```

- `env_file: .env` supplies `AUTH_SECRET`, `AUTH_URL`, and optional OIDC vars
- `environment.DATABASE_URL` overrides the `.env` value to use the Docker network hostname `db`
- `depends_on` with `service_healthy` ensures Postgres is ready before the entrypoint runs

### `.dockerignore` (new)

```
node_modules
.next
src/generated/prisma
.env
docs
tests
*.md
*.log
.git
```

---

## Startup Flow

```
docker compose up
  └── db starts → healthcheck passes
  └── app builds (if not cached) → docker-entrypoint.sh runs
        ├── prisma migrate deploy   (applies any pending migrations)
        └── node server.js          (Next.js standalone server on :3000)
```

---

## Constraints & Notes

- `prisma migrate deploy` is idempotent — safe on container restart
- `AUTH_URL` in `.env` should be `http://localhost:3000` for local testing; the app service binds `HOSTNAME=0.0.0.0` so it accepts connections from outside the container
- OIDC vars are optional — if empty, the SSO button is hidden (pages are dynamic so this is evaluated at request time, not build time)
- The Prisma 7 client is Rust-free (pure JS/TS), so no platform-specific binary concerns in the multi-stage build
