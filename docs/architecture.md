# DocSense architecture and tech stack

This document describes the code that is currently in the repository. It does not describe planned features or deployment choices that are only mentioned in other documentation.

## What the system is

DocSense is a web application for private PDF review. An authenticated owner can upload a PDF, wait for server-side extraction and analysis, view the PDF, ask grounded questions, and share the document with an invited guest. Owners and verified guests can add threaded comments.

The repository has two applications:

- `api/` contains the Node.js backend.
- `web/` contains the React single-page application.

The backend owns authentication, document authorization, file storage, PDF processing, AI processing, conversations, sharing, comments, and real-time comment delivery. The browser talks to it over HTTP, Server-Sent Events, and WebSockets.

## System shape

```text
Browser
  React SPA + PDF.js
        |
        | HTTP: REST and SSE
        | WebSocket: comment updates
        v
Node.js API
  Hono routes
    -> controllers
      -> services
        -> PostgreSQL via Prisma and raw SQL for vectors
        -> Redis
        -> private S3 bucket
        -> SMTP or Mailpit
        -> Gemini and OpenAI through LangChain
```

The API runs as one Node.js process. Document processing is started in the request process and continues asynchronously. On startup, the API scans for pending or stale processing records and attempts to resume them. There is no queue worker, job broker, or separate AI service in the repository.

The comment connection manager also lives in process memory. It groups WebSocket connections by document ID and broadcasts new comment events to the connections in that process.

## Backend architecture

### Request layer

`api/src/server.ts` creates the Hono application and mounts the route groups:

- `/auth` for account creation, email verification, login, logout, and the current user.
- `/api/documents` for document listing, upload, metadata, summaries, and PDF content.
- `/api/documents/:documentId/chat` and conversation routes for grounded chat.
- `/api/documents/:documentId/comments` for threaded comments.
- `/api/documents/:documentId/shares` and `/api/shares` for owner invitations and guest verification.
- `/ws/documents/:documentId/comments` for comment WebSockets.
- `/health` for a simple health response.

The server adds CORS handling, request IDs, request logging, a shared error handler, and the WebSocket server. JSON request bodies are validated with Zod middleware before controllers receive them. PDF uploads are protected by Hono's body limit and by an application-level size check.

### Controllers and services

Controllers are thin HTTP adapters. They read route parameters, cookies, and validated bodies, then call services. Business rules are mostly in `api/src/services`:

- `auth.service.ts` handles users, password verification, email verification, JWT sessions, and logout revocation.
- `document.service.ts` handles filename normalization, PDF validation, S3 upload, document records, and cleanup.
- `share.service.ts` handles share tokens, invited email checks, guest OTPs, guest sessions, and document authorization.
- `chat.service.ts` handles conversation ownership, intent selection, retrieval context preparation, streaming fallback, and persistence.
- `summary.service.ts` generates and stores document summaries.
- `comment.service.ts` loads comments into a tree, creates replies, and broadcasts new comments.
- `ai-persistence.service.ts` persists conversations, messages, chunks, and vector embeddings.
- `email.service.ts` provides the SMTP or local console email boundary.

### Authentication and access control

The API accepts authentication from either a Bearer token or the `docsense_auth` HTTP-only cookie. JWTs use HS256, include a subject, unique `jti`, issue time, and expiry, and last three days. Redis stores revoked `jti` values for the remaining token lifetime.

Passwords use Node's built-in `crypto.scrypt` with a random salt. Signup creates an unverified user and sends a six-digit email OTP. OTP hashes are stored in Redis for three minutes and consumed with `GETDEL`, so each code is single use.

Shared documents use a separate flow:

1. An owner creates a share for an invited email address.
2. The API stores a SHA-256 hash of a random share token and sends the link by email.
3. The invited person submits the same email address and receives a six-digit OTP.
4. A successful OTP check creates a Redis guest session. The session can view and comment on the linked document for up to 24 hours, bounded by the share's seven-day expiry.

Document authorization is centralized in `share.service.ts`. It checks owner access first, then checks the guest session and the active share. The same authorization path is used by document access, chat, comments, summaries, and the comment WebSocket upgrade.

### Document storage and processing

PDF bytes are stored in a private S3 bucket under `private/spot-draft/documents/<document-id>.pdf`. The API streams the stored object back to an authorized browser. Deleting a document removes its object and the related database records through cascading relations.

Upload validation includes:

- filename normalization and control-character checks;
- maximum byte-size checks;
- a PDF header and trailer check through `isPdf`;
- storage upload before the database record is created, with cleanup if record creation fails.

After upload, `ai.service.ts` claims the document and runs this pipeline:

```text
PDF bytes
  -> pdfjs-dist text extraction, page by page
  -> visual fallback for pages with fewer than 8 extracted words
  -> PDF page rendering with @napi-rs/canvas
  -> Gemini vision description for fallback pages
  -> LangChain RecursiveCharacterTextSplitter
  -> Gemini embeddings
  -> PostgreSQL document chunks and pgvector embeddings
  -> chunk summaries
  -> final summary
  -> COMPLETED or FAILED document status
```

The loader limits PDFs to 200 pages, limits visual fallback to 10 pages, and applies rendering size and PNG size limits. The splitter defaults to a 1,200-character chunk size with 200 characters of overlap. Processing rejects documents that produce no readable text and cleans up chunks when the pipeline fails.

Processing status is stored on `Document` as `PENDING`, `PROCESSING`, `COMPLETED`, or `FAILED`. The frontend polls the summary endpoint while processing. The dashboard also polls while any listed document remains pending or processing.

### Retrieval augmented chat

Chat requests are authorized against the document and an owner or guest-specific conversation. The service keeps up to five conversation turns for prompt context. A Gemini model classifies the request as `normal`, `document_summary`, or `explain_again`; classification failure falls back to normal chat behavior.

The question is embedded with Gemini. PostgreSQL uses pgvector cosine-distance ordering to return document chunks from the requested document only. Retrieval defaults to five chunks and a minimum similarity of `0.2`.

LangChain builds the prompt from the document summary, retrieved chunks, conversation history, and the question. These values are marked as untrusted data in the prompt. The system prompt requires grounded answers of three to five complete sentences and tells the model to state when the document does not support an answer.

The primary chat model is OpenAI when configured. Gemini is used as the fallback. Fallback is attempted only if the primary model fails before it emits a token. The API sends the result as SSE events: `message.start`, `message.token`, `message.complete`, or `message.error`.

Completed user and assistant messages are written to PostgreSQL in one transaction.

### Comments and real-time updates

Comment content is stored as validated JSON with paragraphs or bullet lists. Each comment can have a parent comment, which gives the API a threaded tree when comments are read. A comment belongs either to an authenticated user or to a guest share principal.

The REST endpoint remains the source of truth. After a comment is created, the in-process connection manager broadcasts a `comment.created` event to WebSocket clients connected to the same document. The frontend reconnects with bounded exponential backoff and ignores malformed events.

## Data model

PostgreSQL is accessed through Prisma 6. The schema contains these models:

- `User`: account identity, password hash, verification state, and ownership links.
- `Document`: owner, original and normalized filename, S3 key, size, MIME type, summary, and processing status.
- `DocumentShare`: invited email, hashed share token, status, expiry, and acceptance time.
- `DocumentChunk`: extracted text, page range, chunk order, and an optional `vector(3072)` embedding.
- `Conversation`: document conversation scoped to either a registered user or a document share.
- `Message`: user or assistant content within a conversation.
- `Comment`: JSON content, optional parent, and either a user or share author.

Foreign keys use cascading deletes for document-owned data. The migrations enable the PostgreSQL `vector` extension. The embedding column is represented in Prisma as `Unsupported("vector(3072)")`, so vector inserts and similarity queries use parameterized raw SQL.

## Frontend architecture

The web app is a Vite-built React 19 SPA written in TypeScript. It does not use a client-side router package. `App.tsx` derives the current screen from `window.location.pathname` and `window.location.hash`, then listens for `popstate` and `hashchange` events.

The main screens are:

- `AuthPage` for sign-in and account creation.
- `OtpPage` for new-account email verification.
- `AuthenticatedPage` for the owner's document list, upload, search, and sharing modal.
- `ShareAccessPage` for guest email verification.
- `SharedDocumentPage` for the PDF workspace, summary, chat, and comments.

The frontend uses browser cookies for session credentials. API modules wrap authentication and chat requests. The comments hook owns REST loading, WebSocket connection state, reconnection, and threaded optimistic insertion. `PdfViewer` uses PDF.js in the browser, renders pages to canvases, and provides scrolling, page navigation, zoom, and fullscreen controls.

Styling is concentrated in `web/src/styles.css`. It includes responsive layouts, the visual theme, loading states, reduced-motion handling, and focus styles. The frontend has one standalone comment-state test script and the backend has standalone TypeScript test scripts rather than a test runner dependency.

## Tech stack

### Runtime and languages

- Node.js 22.13 or newer for the API.
- TypeScript with strict compiler settings in both applications.
- React 19 and React DOM 19 for the frontend.
- Vite 8 for frontend development and builds.

### Backend packages

- Hono for HTTP routing and middleware.
- `@hono/node-server` for the Node server and WebSocket upgrade integration.
- Prisma 6.19.3 and `@prisma/client` for PostgreSQL access and migrations.
- PostgreSQL 16 with the `pgvector` extension.
- `ioredis` with Redis 7 for OTPs, token revocation, rate limiting keys, and guest sessions.
- `jose` for JWT signing and verification.
- Zod 4 for request and environment validation.
- Nodemailer for SMTP delivery.
- AWS SDK S3 client for private PDF storage.
- `ws` and Hono WebSocket helpers for comment connections.
- LangChain packages for prompts, chat models, document splitting, and Google embeddings.
- `pdfjs-dist` and `@napi-rs/canvas` for server-side PDF extraction and visual rendering.

### Frontend packages

- React and React DOM.
- Vite and `@vitejs/plugin-react`.
- `pdfjs-dist` for PDF rendering.
- Browser `fetch`, cookies, WebSocket, Server-Sent Events consumption, `IntersectionObserver`, `ResizeObserver`, and the Fullscreen API for application behavior.

### Local infrastructure

`api/docker-compose.yml` provides:

- `pgvector/pgvector:pg16` on port 5432;
- `redis:7-alpine` on port 6379;
- Mailpit on SMTP port 1025 and web port 8025;
- the API on port 3000.

The frontend Vite server runs on port 5173 by default and proxies `/api`, `/auth`, and `/ws` to the local API during development.

## External service boundaries

The API expects these external boundaries to be configured through environment variables:

- PostgreSQL for durable application data and vector search.
- Redis for short-lived and revocation state.
- AWS S3 for private PDF bytes.
- SMTP, or Mailpit locally, for verification and share emails.
- Google Gemini for vision, chunk summaries, intent classification, fallback chat, and embeddings.
- OpenAI for the primary chat model and final summary when an OpenAI key is configured.

The model names, database URLs, storage credentials, email settings, and size limits are configuration values. The repository does not include provider credentials.

## Engineering decisions

### 1. Store PDFs in private S3

PDF bytes are kept in a private S3 bucket instead of PostgreSQL. PostgreSQL stores document metadata and the S3 object key, while the API remains responsible for authorization and streams the file back to the browser. This keeps large binary files out of the relational database and avoids exposing storage credentials or public object URLs.

### 2. Use WebSockets for comments

Comments are persisted through REST, but new comments are broadcast over a document-scoped WebSocket. REST remains the authoritative source, while WebSockets let other reviewers see new comments without polling. The current connection manager is in memory and groups sockets by document ID.

### 3. Keep AI processing behind a backend boundary

PDF extraction, visual fallback, chunking, embeddings, retrieval, summaries, and chat all run in the API. The browser never receives provider credentials or calls the model providers directly. This also keeps document authorization, prompt construction, persistence, and provider fallback in one place.

### 4. Stream chat to the browser with SSE

LangChain chat models expose an async stream interface. The API can consume that stream and send the generated response to the browser as Server-Sent Events, without introducing a separate streaming protocol. The current endpoint sends `message.start`, `message.token`, `message.complete`, and `message.error` events.

### 5. Guests cannot share documents

A guest session is tied to one invited share and one document. Guests can view the document and add comments, but only the authenticated document owner can create, list, or revoke share links. This keeps access delegation with the owner instead of allowing a guest to extend the document's audience.

## Important current limits

These are implementation details worth knowing before extending the system:

- Document processing runs in the API process rather than in a durable job queue.
- WebSocket connections are held in one process's memory. A multi-instance deployment would need shared event delivery or connection affinity for complete cross-instance broadcasts.
- The frontend polls processing status instead of receiving a processing event.
- The API stores only completed chat turns. A failed or interrupted stream is not persisted as a completed answer.
- PDF visual fallback is limited to 10 pages, and document processing is limited to 200 PDF pages and 500 chunks.
- The browser receives PDF bytes through an authorized API response and then creates a local object URL for PDF.js. S3 objects are not exposed directly to the browser.
- `docs/engineering-decisions.md` and `docs/testing.md` are currently empty, so this document does not treat them as sources of additional decisions or test coverage.
