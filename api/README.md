# Docsense API

Backend foundation for the AI PDF Intelligence & Collaboration System. This phase only provides the REST API skeleton, a health endpoint, and PostgreSQL/Prisma setup.

## Stack

- Node.js and TypeScript
- Hono with the Node adapter
- PostgreSQL with Prisma ORM
- LangChain and S3 are reserved for later phases

## Structure

- `src/routes` — HTTP route definitions
- `src/controllers` — HTTP/controller layer skeletons
- `src/services` — application service skeletons
- `src/ai` — reserved LangChain integration boundary
- `src/storage` — reserved S3 integration boundary
- `src/db` — Prisma client access
- `src/middleware` — shared HTTP middleware
- `prisma/schema.prisma` — PostgreSQL Prisma configuration

## Setup

From this directory:

```bash
npm install
cp .env.example .env
```

The included local PostgreSQL setup uses:

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/docsense"
```

Set `PORT` and `NODE_ENV` as needed. The credentials are for local development only. Do not commit `.env` or real credentials.

## Prisma

Generate the Prisma client:

```bash
npm run prisma:generate
```

When database models are added, create a development migration with:

```bash
npm run prisma:migrate -- --name initial
```

The current schema intentionally contains no application models.

## Development

Run PostgreSQL locally with Docker Compose:

```bash
docker compose up -d db
cp .env.example .env
npm run dev
```

Or build and start both PostgreSQL and the backend in containers:

```bash
docker compose up --build
```

The server listens on `http://localhost:3000` by default. Verify the foundation with:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok"}
```

Other feature routes and services are placeholders only and are not mounted or implemented yet.

## Docker

`Dockerfile` builds the TypeScript backend and starts the compiled server. PostgreSQL is provided separately by `docker-compose.yml`.

Stop the local services with:

```bash
docker compose down
```

Add `-v` only when you want to delete the local PostgreSQL data volume.

## Checks

```bash
npm run typecheck
npm run build
```
