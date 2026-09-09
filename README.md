# DocSense — PDF Intelligence & Collaboration System

DocSense is an enterprise-grade, private PDF workspace for legal, compliance, and product teams to upload complex documents, generate grounded summaries, query content via LLM-powered RAG chat, share access securely, and collaborate through real-time threaded comments.

---

## 1. System Architecture

```
                                  +---------------------------------------+
                                  |         React 19 Frontend (SPA)       |
                                  |  - PDF.js Canvas Viewer               |
                                  |  - SSE Streaming AI Chat              |
                                  |  - Live WebSocket Threaded Comments   |
                                  +-------------------+-------------------+
                                                      |
                                       HTTPS / WSS    | REST / SSE / WS
                                                      v
+-----------------------------------------------------+-----------------------------------------------------+
|                                          Hono + Node.js API                                               |
|                                                                                                           |
|  [ Auth & Security ]       [ Storage Gateway ]      [ AI Pipeline & LangChain ]      [ Real-Time Sync ]   |
|  - scrypt Password Hash    - Signature Validation   - Hybrid PDF / VLM Loader        - WS Connection Pool |
|  - 3-Day JWT & Revocation  - Private S3 Bucket      - Text Splitter & Embeddings     - Live Broadcast     |
|  - Email OTP Flow          - S3 Clean-up Cascades   - Map-Reduce Summarizer          - Multi-Client Rooms |
|                                                     - Grounded RAG + Fallback Model                       |
+--------+----------------------------+-----------------------+---------------------------------+-----------+
         |                            |                       |                                 |
         v                            v                       v                                 v
+------------------+        +------------------+    +-------------------+             +-------------------+
|  Redis 7 Cluster |        | Private AWS S3   |    | PostgreSQL 16     |             | AI Model Providers|
|                  |        |                  |    | (pgvector)        |             |                   |
| - OTP Tokens     |        | Path:            |    | - Users & Docs    |             | - Gemini 2.0/1.5  |
| - Guest Sessions |        | /private/        |    | - Document Chunks |             |   (Embeddings,    |
| - JWT Denylist   |        |  spot-draft/     |    | - Vector (3072)   |             |    Vision, Chat)  |
| - Rate Limiting  |        |  documents/      |    | - Comments        |             | - OpenAI GPT-4o   |
|                  |        |                  |    | - Conversations   |             |   (Summary/Chat)  |
+------------------+        +------------------+    +-------------------+             +-------------------+
```

---

## 2. Engineering Thinking & Design Decisions

### A. Co-located `pgvector` vs. External Vector DBs
* **Decision**: Chunks and 3072-dimensional vector embeddings are stored directly in PostgreSQL using `pgvector` (`Unsupported("vector(3072)")`) rather than external vector stores like Pinecone.
* **Rationale**: Co-locating relational metadata, comments, permissions, and vector embeddings in a single ACID-compliant database guarantees atomic transactions, cascade deletions (`ON DELETE CASCADE`), and prevents data drift when documents are removed.

### B. Hybrid PDF Text & Visual Parsing (VLM)
* **Decision**: PDF parsing first uses `pdfjs-dist` to extract structured text layers. If a page is scanned, contains diagrams, or lacks text, DocSense automatically falls back to rendering the page via `@napi-rs/canvas` and processing it through Gemini Vision (`gemini-2.0-flash`).
* **Rationale**: Real-world contracts and technical documents contain tables, flowcharts, and scans that pure text parsers miss. Selective VLM extraction ensures complete document comprehension without incurring unnecessary latency or token cost on text-heavy pages.

### C. Map-Reduce Summarization for Long Documents
* **Decision**: Long documents are split into deterministic chunks (1,000 tokens with 200 token overlap). Each chunk is summarized individually before a final synthesis step reduces the chunk summaries into a strict **3 to 5 sentence executive summary**.
* **Rationale**: Avoids context window truncation and attention degradation on 50+ page PDFs while strictly enforcing concise, high-signal summaries suitable for dashboard cards and quick review ribbons.

### D. Multi-Turn Conversational RAG with Intent Classification
* **Decision**: Chat queries pass through a zero-shot intent classifier (`normal`, `document_summary`, `explain_again`):
  - Retains the last **3–5 conversational turns** (`MAX_CONVERSATION_TURNS = 5`).
  - Evaluates similarity thresholds against pgvector embeddings.
  - Formats retrieved chunks with page-number metadata (`Page X` or `Pages X-Y`).
* **Prompt Injection Defense**: Untrusted document content, user questions, and history are enclosed inside XML tags (`<document_data>`, `<conversation_data>`, `<question>`). The system prompt explicitly treats these blocks as untrusted data rather than executable instructions.

### E. Resilient Streaming with Primary-to-Fallback Handoff
* **Decision**: Chat streams tokens over Server-Sent Events (SSE). If the primary model (e.g., OpenAI) fails before any token is emitted, the stream transparently switches to the fallback model (e.g., Gemini) without breaking the client stream or leaking partial error text.

### F. Frictionless Yet Secure Guest Access
* **Decision**: Share links (`/#/share/:token`) generate cryptographically secure SHA-256 tokens. Invited reviewers do not need to register a full account; they verify their identity via a 6-digit email OTP. Once verified, a 24-hour guest session is stored in Redis.

### G. Real-time Threaded Comments
* **Decision**: Comments support parent-child threading and rich text formatting. Mutation endpoints broadcast real-time events over dedicated WebSockets (`/ws/documents/:documentId/comments`) to all connected reviewers.

---

## 3. Testing Knowledge & Verification Matrix

DocSense includes **21 dedicated automated test suites** with **268+ assertions** covering unit, integration, and E2E flows:

| Category | Suite Script | What is Verified |
|---|---|---|
| **AI Extraction** | `pdf-loader-unit.ts` | Page ordering, layout extraction, empty pages, malformed PDF rejection. |
| **Vision Fallback** | `vlm-loader-unit.ts` | Canvas page rasterization, selective fallback triggers, structured metadata. |
| **Chunking** | `document-splitter-unit.ts` | Token overlap, boundary preservation, chunk metadata indices. |
| **Embeddings** | `embedding-retrieval-unit.ts`<br>`embedding-retrieval-integration.ts` | Vector dimensions (3072), pgvector cosine similarity, strict tenant document isolation. |
| **Summarization** | `summary-unit.ts`<br>`summary-integration.ts` | Chunk summarization, map-reduce prompt grounding, 3–5 sentence validation. |
| **RAG Context** | `context-builder-unit.ts`<br>`context-builder-live.ts` | XML injection defense, 5-turn sliding window trimming, intent classification. |
| **Chat & Stream** | `chat-service-unit.ts` | Token extraction, SSE streaming lifecycle, fallback pre-token handoff. |
| **AI DB Foundation** | `ai-foundation-integration.ts` | pgvector availability, vector CRUD, conversation foreign-key constraints. |
| **Authentication** | `auth-e2e.ts` | Signup, scrypt hashing, OTP generation/TTL/single-use in Redis, JWT claims & revocation. |
| **Guest Sessions** | `session-e2e.ts` | Guest token hashing, 24-hr TTL in Redis, verified share document access. |
| **Document Storage** | `document-unit.ts`<br>`document-integration.ts`<br>`document-e2e.ts` | PDF magic byte sniffing, filename normalization, private S3 lifecycle & cleanup. |
| **Comments & WS** | `comments-e2e.ts`<br>`comment-websocket-e2e.ts`<br>`comment-connection-unit.ts`<br>`comment-broadcast-failure.ts` | Root & threaded comments, WebSocket connection lifecycle, multi-client room broadcasts. |
| **Frontend State** | `comments-sync.test.ts` | Optimistic comment tree updates and threaded hierarchy assembly. |

### Running the Test Suites

Execute the standalone unit checks (no live infrastructure required):
```bash
# Backend unit suites
npm --prefix api run test:documents:unit
npm --prefix api run test:ai:pdf-loader
npm --prefix api run test:ai:vlm-loader
npm --prefix api run test:ai:splitter
npm --prefix api run test:ai:summary
npm --prefix api run test:ai:context
npm --prefix api run test:ai:chat

# Frontend state unit checks
npm --prefix web run test:comments
```

Execute integration and E2E suites (with PostgreSQL, Redis, Mailpit running):
```bash
cd api
npm run e2e:auth
npm run test:documents:e2e
npm run e2e:sessions
npm run e2e:comments
npm run e2e:comments:websocket
npm run test:ai:foundation
npm run test:ai:embeddings:integration
npm run test:ai:summary:integration
```

---

## 4. API Surface

| Area | Method & Route | Description |
|---|---|---|
| **Health** | `GET /health` | Service uptime and status probe |
| **Auth** | `POST /auth/signup` | Register new account & trigger email OTP |
| | `POST /auth/verify-email` | Validate 6-digit OTP and activate account |
| | `POST /auth/login` | Authenticate credentials & issue 3-day JWT |
| | `POST /auth/logout` | Revoke active JWT session in Redis |
| | `GET /auth/me` | Fetch authenticated user profile |
| **Documents** | `GET /api/documents` | List uploaded PDFs with summary status |
| | `POST /api/documents` | Multipart PDF upload & start AI background pipeline |
| | `GET /api/documents/:id` | Get document metadata and access status |
| | `GET /api/documents/:id/summary` | Fetch 3–5 sentence AI summary & status |
| | `GET /api/documents/:id/content` | Stream private PDF bytes from S3 |
| **Sharing** | `GET /api/documents/:id/shares` | List document invitations (Owner only) |
| | `POST /api/documents/:id/shares` | Create new share link & send invite email |
| | `DELETE /api/documents/:id/shares/:shareId` | Revoke collaborator share link |
| | `POST /api/shares/request-otp` | Request guest verification code |
| | `POST /api/shares/verify-otp` | Verify guest OTP & establish 24-hr session |
| **Chat** | `POST /api/documents/:id/chat` | Send question & stream SSE tokens with RAG context |
| | `GET /api/documents/:id/conversations` | Retrieve conversation history |
| **Comments** | `GET /api/documents/:id/comments` | Fetch all root and threaded comments |
| | `POST /api/documents/:id/comments` | Post root comment or reply |
| | `GET /ws/documents/:id/comments` | WebSocket channel for real-time comment broadcast |

---

## 5. Local Setup & Running

### Requirements
- Node.js 22.13 or newer
- Docker & Docker Compose

### 1. Start Services and API
```bash
cd api
cp .env.example .env
# Fill in JWT_SECRET, AWS credentials, S3 bucket, and AI keys (GEMINI_API_KEY / OPENAI_API_KEY)
docker compose up --build
```
* **API**: `http://localhost:3000`
* **Mailpit Web UI (Captured Emails)**: `http://localhost:8025`
* **PostgreSQL**: `localhost:5432`
* **Redis**: `localhost:6379`

### 2. Start Frontend
```bash
cd web
npm ci
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 6. Production Deployment Guide

Follow this step-by-step guide to deploy DocSense to production environments (AWS, Railway, Render, Fly.io, or VPS).

### Step 1: Provision Managed Infrastructure

1. **PostgreSQL with `pgvector`**:
   - Provision a PostgreSQL 16+ instance (Supabase, Neon, AWS RDS, or Render).
   - Ensure the `vector` extension is supported:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```
2. **Redis 7+**:
   - Provision managed Redis (Upstash, AWS ElastiCache, or Redis Cloud) for OTP and guest session tokens.
3. **Private AWS S3 Bucket**:
   - Create a dedicated private S3 bucket.
   - Create an IAM User/Role with minimal scoped permissions:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
           "Resource": "arn:aws:s3:::your-docsense-bucket/private/spot-draft/documents/*"
         }
       ]
     }
     ```
4. **SMTP Service**:
   - Configure transactional email credentials (Postmark, SendGrid, AWS SES, or Resend).
5. **AI API Keys**:
   - Obtain `GEMINI_API_KEY` from Google AI Studio and `OPENAI_API_KEY` from OpenAI.

---

### Step 2: Configure Environment Variables

Configure the following environment secrets on your hosting provider (never commit `.env` to source control):

| Environment Variable | Description | Example / Note |
|---|---|---|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | API listen port | `3000` |
| `APP_URL` | Exact HTTPS origin of web client (for CORS & cookies) | `https://docsense.yourdomain.com` |
| `DATABASE_URL` | PostgreSQL connection pool URL | `postgresql://user:pass@host:5432/docsense?sslmode=require` |
| `REDIS_URL` | Redis connection URI | `rediss://default:token@host:6379` |
| `JWT_SECRET` | 32+ character cryptographically random secret | Generate via `openssl rand -base64 32` |
| `AWS_REGION` | AWS S3 region | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | IAM Access Key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | IAM Secret Access Key | `wJalrXUtn...` |
| `AWS_S3_BUCKET` | Target private S3 bucket name | `docsense-production-storage` |
| `MAX_PDF_SIZE_BYTES` | Maximum allowed upload size (bytes) | `33554432` (32 MB) |
| `SMTP_HOST` | Transactional email SMTP host | `smtp.postmarkapp.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | `api-key-or-token` |
| `SMTP_PASS` | SMTP password / API token | `your-smtp-password` |
| `MAIL_FROM` | Verified sender email | `DocSense <noreply@yourdomain.com>` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSy...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |

---

### Step 3: Deploy Backend API & Run Migrations

#### Option A: Deploy via Docker (Render, Fly.io, Railway, AWS ECS)
1. Build the production Docker image from `api/`:
   ```bash
   cd api
   docker build -t docsense-api .
   ```
2. Run database migrations during release phase:
   ```bash
   npx prisma migrate deploy
   ```
3. Start the container with injected environment variables:
   ```bash
   docker run -d --name docsense-api \
     --env-file .env.production \
     -p 3000:3000 \
     docsense-api
   ```

#### Option B: Deploy on a Linux VPS (Ubuntu + PM2 + Systemd)
```bash
cd /opt/docsense/api
npm ci
npm run prisma:deploy
npm run build
pm2 start dist/server.js --name docsense-api -i max
pm2 save
```

---

### Step 4: Deploy Frontend (Vercel, Cloudflare Pages, Netlify)

1. Build the frontend SPA, passing the backend API origin:
   ```bash
   cd web
   npm ci
   VITE_API_URL=https://api.yourdomain.com npm run build
   ```
2. **SPA Routing Configuration**:
   Ensure all client-side routes (e.g., `/documents/:id`, `/authenticated`, `/otp`) rewrite to `/index.html`:
   - **Vercel (`vercel.json`)**:
     ```json
     {
       "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
     }
     ```
   - **Netlify (`_redirects`)**:
     ```text
     /*    /index.html   200
     ```
   - **Cloudflare Pages**: Automatically handled for Single Page Applications.

---

### Step 5: Nginx Reverse Proxy & WebSocket Configuration (If using VPS)

If hosting the API on a VPS behind Nginx, configure TLS and enable WebSocket connection upgrades for `/ws/*`:

```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
}
```

---

### Step 6: Post-Deployment Smoke Verification

1. **Health Check**:
   ```bash
   curl -i https://api.yourdomain.com/health
   # Expected: HTTP/1.1 200 OK -> {"status":"ok"}
   ```
2. **End-to-End User Verification**:
   - Register a new account on the frontend and verify receipt of the 6-digit email OTP.
   - Upload a test PDF and verify that the 3–5 sentence AI summary populates on the dashboard.
   - Open the PDF workspace, test the AI chat stream (verify token-by-token streaming & grounded answers).
   - Generate a Share link, open in an incognito window, verify guest OTP access, and post a real-time threaded comment.
