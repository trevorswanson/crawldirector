# Dockerfile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-stage Dockerfile and update docker-compose so `docker compose up` brings up Postgres + the Next.js app with migrations applied automatically.

**Architecture:** A `builder` stage installs deps and produces a Next.js standalone bundle; a lean `runner` stage copies only the standalone output plus the Prisma CLI needed to run `migrate deploy` at container start. An entrypoint script runs migrations then hands off to `node server.js`.

**Tech Stack:** Node 20 Alpine, Next.js 16 standalone output, Prisma 7 (Rust-free client), Docker Compose v2

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `next.config.ts` | Enable `output: "standalone"` |
| Create | `.dockerignore` | Exclude node_modules, .next, secrets from build context |
| Create | `docker-entrypoint.sh` | Run `prisma migrate deploy` then start server |
| Create | `Dockerfile` | Multi-stage build: builder + runner |
| Modify | `docker-compose.yml` | Add `app` service wired to `db` |

---

### Task 1: Enable Next.js standalone output

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add `output: "standalone"` to next.config.ts**

Replace the file with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify the build produces a standalone bundle**

```bash
npm run build
```

Expected: build succeeds and `.next/standalone/server.js` exists:

```bash
ls .next/standalone/server.js
```

Expected output: `.next/standalone/server.js`

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: enable Next.js standalone output for container builds"
```

---

### Task 2: Create .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

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

This keeps the build context small and prevents secrets and build artifacts from leaking into the image.

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "feat: add .dockerignore"
```

---

### Task 3: Create docker-entrypoint.sh

**Files:**
- Create: `docker-entrypoint.sh`

- [ ] **Step 1: Create docker-entrypoint.sh**

```sh
#!/bin/sh
set -e
node_modules/.bin/prisma migrate deploy
exec node server.js
```

`set -e` aborts on any error so a failed migration stops the container rather than starting the app against an unmigrated database. `exec` replaces the shell process so the Node server gets PID 1 and receives signals directly.

- [ ] **Step 2: Make it executable**

```bash
chmod +x docker-entrypoint.sh
```

- [ ] **Step 3: Commit**

```bash
git add docker-entrypoint.sh
git commit -m "feat: add docker entrypoint (migrate then start)"
```

---

### Task 4: Create Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# ─── Builder ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Runner ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone Next.js bundle
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma migration tooling (CLI + TypeScript config loader + dotenv)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder /app/node_modules/jiti ./node_modules/jiti

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
```

Notes:
- `npm ci` in the builder triggers `postinstall` → `prisma generate`, so the Prisma client is generated as part of the install step.
- `HOSTNAME=0.0.0.0` is required for the Next.js standalone server to accept connections from outside the container (it defaults to `localhost`).
- `node_modules/jiti` is needed because Prisma 7 uses jiti to load the TypeScript `prisma.config.ts` at CLI invocation time.

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage Dockerfile (standalone runner)"
```

---

### Task 5: Update docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add the app service**

Replace `docker-compose.yml` with:

```yaml
services:
  db:
    image: postgres:18
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: dcc
    ports:
      - "5432:5432"
    volumes:
      - dcc-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

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

volumes:
  dcc-postgres:
```

`env_file: .env` supplies `AUTH_SECRET`, `AUTH_URL`, and optional OIDC vars. The inline `DATABASE_URL` under `environment:` overrides the `.env` value, replacing `localhost` with the Docker Compose service hostname `db`.

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add app service to docker-compose (builds Dockerfile, auto-migrates)"
```

---

### Task 6: End-to-end verification

No code changes — this task verifies the stack works.

- [ ] **Step 1: Build the image**

```bash
docker compose build
```

Expected: both build stages complete, image tagged as `dcc-campaign-builder-app`.

- [ ] **Step 2: Start the full stack**

```bash
docker compose up
```

Expected log sequence:
1. `db` container starts and passes healthcheck (`pg_isready`)
2. `app` container starts, entrypoint runs `prisma migrate deploy` (output: `Applied N migration(s)`)
3. `app` logs `▲ Next.js ... Ready on http://0.0.0.0:3000`

- [ ] **Step 3: Verify the app is reachable**

Open `http://localhost:3000` — should redirect to `/sign-in`.

- [ ] **Step 4: Smoke-test auth and tenancy**

1. Create an account at `/sign-up`
2. Sign in at `/sign-in` — should land on `/dashboard`
3. Create a campaign — should appear in the dashboard list
4. Open a private/incognito window, create a second account, confirm the first user's campaign is not visible

- [ ] **Step 5: Verify restart is safe (migrations are idempotent)**

```bash
docker compose restart app
```

Expected: `prisma migrate deploy` logs `Already in sync, no schema changes or pending migrations.`, app starts cleanly.
