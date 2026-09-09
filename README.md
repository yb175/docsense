# DocSense

DocSense is a private PDF workspace for teams that need to upload documents, generate grounded summaries, ask questions against document content, and share access with reviewers.

It is split into a React/Vite web app and a Node.js API. The API stores document metadata in PostgreSQL, session revocations and one-time codes in Redis, and PDF files in private S3-compatible storage.

## What it does

- Email signup, verification, login, and server-managed session cookies
- PDF upload with size, filename, and file-signature validation
- Background PDF extraction, summaries, embeddings, and document-scoped chat
- Owner and invited-reviewer document access
- Live comments and replies over WebSockets
- Dashboard search by PDF filename

## Architecture

```text
web/                  React 19 + Vite + PDF.js
api/                  Hono + TypeScript
api/prisma/           PostgreSQL schema, including pgvector embeddings
PostgreSQL            users, documents, shares, comments, conversations
Redis                 verification codes and revoked JWT IDs
S3                    private uploaded PDFs
OpenAI / Gemini       summaries, chat, vision fallback, embeddings
```

## Requirements

- Node.js 22.13 or newer
- PostgreSQL with the `vector` extension. The supplied Compose stack uses `pgvector/pgvector:pg16`.
- Redis 7 or newer
- A private S3 bucket and AWS credentials with access limited to that bucket
- SMTP credentials for verification email
- Gemini credentials for embeddings and visual PDF fallback. OpenAI credentials are required when using the default summary and chat models.

## Run locally

Start the supporting services and API from `api/`:

```bash
cd api
cp .env.example .env
# Set JWT_SECRET, AWS_S3_BUCKET, AWS credentials, and AI provider keys in .env.
docker compose up --build
```

`docker compose` starts PostgreSQL, Redis, Mailpit, and the API. Mailpit captures verification emails at <http://localhost:8025>. Its API is available at <http://localhost:3000>.

In another terminal, start the web app:

```bash
cd web
npm ci
npm run dev
```

The web app expects the API at `http://localhost:3000`. Set `VITE_API_URL` when it is hosted elsewhere:

```bash
VITE_API_URL=https://api.example.com npm run build
```

> [!IMPORTANT]
> The API requires S3 and AI configuration even for local startup. Do not use production credentials in a local `.env` file.

## Configuration

Start with [`api/.env.example`](api/.env.example). These values must be set for a production API:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Enables secure, cross-site authentication cookies. |
| `APP_URL` | Exact public web origin allowed by CORS. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL` | Redis connection string. |
| `JWT_SECRET` | Random secret with at least 32 characters. |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` | Private PDF storage. |
| `MAX_PDF_SIZE_BYTES` | Upload limit. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Verification email delivery. |
| `GEMINI_API_KEY` | Embeddings and visual extraction fallback. |
| `OPENAI_API_KEY` | Default summary and chat models. |

Keep environment files and provider credentials out of source control. Configure secrets in the deployment platform instead of baking them into an image.

## Deploy

1. Provision PostgreSQL with pgvector, Redis, a private S3 bucket, SMTP, and AI provider credentials.
2. Set the production environment variables listed above. Set `APP_URL` to the exact HTTPS origin of the web app.
3. Build and run the API image:

   ```bash
   cd api
   docker build -t docsense-api .
   docker run --env-file .env -p 3000:3000 docsense-api
   ```

4. Run database migrations as part of the release:

   ```bash
   cd api
   npm ci
   npm run prisma:deploy
   ```

5. Build `web/` with `VITE_API_URL` set to the public API origin, then serve `web/dist` from an HTTPS static host. Make sure the host forwards SPA routes to `index.html`.
6. Put the API behind TLS. Authentication cookies are marked `Secure` in production and will not work over plain HTTP.

The included [`api/docker-compose.yml`](api/docker-compose.yml) is intended for local development. Use managed services or equivalent backups, monitoring, and network controls in production.

## Verify a release

```bash
cd api
npm ci
npm run typecheck
npm run build
npm run e2e:auth

cd ../web
npm ci
npm run build
npm run test:comments
```

The API end-to-end suite needs the configured PostgreSQL, Redis, SMTP, and S3 services. The web build checks the production bundle; the comment check runs without external services.

## API surface

| Area | Routes |
| --- | --- |
| Health | `GET /health` |
| Authentication | `POST /auth/signup`, `POST /auth/verify-email`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Documents | `GET/POST /api/documents`, `GET /api/documents/:documentId`, `/summary`, `/content` |
| Collaboration | Document share, comment, and chat routes under `/api` |

See [`api/README.md`](api/README.md) for API-level checks and implementation notes, and [`web/README.md`](web/README.md) for frontend commands.
