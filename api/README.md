# Docsense API

REST backend for the AI PDF Intelligence & Collaboration System. The current implementation includes the authentication foundation; PDF, AI, sharing, comments, and chat features remain unimplemented.

## Stack

- Node.js, TypeScript, and Hono
- PostgreSQL with Prisma ORM
- Redis for OTP storage and JWT revocation
- SMTP email abstraction; Mailpit is used locally for email capture, with provider SMTP supported for real delivery
- `jose` for JWT handling and Node `crypto.scrypt` for password hashing

## Setup

From this directory:

```bash
npm install
cp .env.example .env
```

Set a local-only JWT secret in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Assign the output to `JWT_SECRET`. Never commit `.env` or real secrets.

## Run the full local stack

This starts PostgreSQL, Redis, Mailpit, and the API. Database migrations run before the API starts.

```bash
docker compose up --build
```

Services:

- API: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Mailpit UI: `http://localhost:8025`
- Mailpit SMTP: `localhost:1025`

Local Compose defaults to Mailpit, so OTPs appear in the Mailpit UI and are not delivered to external inboxes. For real delivery, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in `.env` before starting Compose. For Gmail, use `smtp.gmail.com`, port `587`, and a Gmail app password.

The PostgreSQL and Redis data volumes are preserved by `docker compose down`. Use `docker compose down -v` only when you intentionally want to delete them.

## Run the API locally

Start infrastructure only:

```bash
docker compose up -d db redis mailpit
npm run prisma:migrate -- --name initial
npm run dev
```

The local `.env.example` values point the host-run API at `localhost`. The Docker Compose API service overrides internal service addresses with `db`, `redis`, and `mailpit`.

## Authentication endpoints

- `POST /auth/signup` — creates an unverified user and sends a six-digit email OTP
- `POST /auth/verify-email` — consumes the OTP and marks the email verified
- `POST /auth/login` — returns a three-day Bearer JWT after verification
- `POST /auth/logout` — revokes the current JWT in Redis
- `GET /auth/me` — protected-route example

JWTs contain the user ID as `sub`, a unique `jti`, `iat`, and `exp`. Passwords are stored as scrypt hashes. OTP hashes are stored in Redis with a fixed three-minute TTL and are consumed atomically.

Example health check:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok"}
```

## Prisma

```bash
npm run prisma:generate
npm run prisma:migrate -- --name <migration-name>
npm run prisma:deploy
```

The authentication schema currently contains only the `User` model.

## Verification

Run static checks:

```bash
npm run typecheck
npm run build
```

With the API, PostgreSQL, Redis, and Mailpit running, execute the production-shaped authentication smoke suite:

```bash
npm run e2e:auth
```

The suite covers signup, password hashing, normalization, OTP delivery/TTL/single-use behavior, login gating, JWT claims and expiry, protected routes, tampered/expired tokens, logout, and Redis revocation.

## Structure

- `src/routes` — HTTP routes
- `src/controllers` — thin HTTP handlers
- `src/services` — application logic
- `src/middleware` — validation, errors, and JWT authentication
- `src/lib` — environment, password, OTP, and JWT utilities
- `src/db` — Prisma and Redis clients
- `src/ai` — reserved LangChain boundary
- `src/storage` — reserved S3 boundary
- `prisma/schema.prisma` — PostgreSQL schema
