# Testing and QA

This repository uses small, runnable TypeScript checks instead of Jest, Vitest, or a browser test framework. The checks are launched with `tsx` in the API and Node's type stripping support in the web app. They use Node assertions and explicit setup and cleanup.

The test scripts are useful for checking the current behavior of the application. This document does not claim that every check is passing in every environment. Provider credentials, Docker services, S3 access, and the configured test database affect the integration and end-to-end suites.

## QA approach

Testing is split by dependency level:

1. **Unit checks** run against pure or locally isolated logic. They cover parsing, validation, splitting, prompt construction, state updates, and provider adapters with test doubles.
2. **Integration checks** use PostgreSQL, Redis, and selected external boundaries. They verify persistence, vector retrieval, summaries, and authorization across components.
3. **End-to-end checks** exercise complete backend flows such as signup, document upload, guest access, comments, and WebSocket delivery.
4. **Frontend state checks** verify the threaded comment tree without rendering the full application.

The main user paths under test are:

```text
account signup -> email OTP -> verified session
owner upload -> PDF validation -> S3 -> AI processing -> summary
owner opens document -> authorized PDF stream -> PDF viewer
owner asks question -> retrieval -> grounded chat -> SSE response -> history
owner shares document -> invited email OTP -> guest session
owner or guest comments -> PostgreSQL -> WebSocket broadcast -> UI update
```

## Backend unit checks

These checks do not need live AI providers. Some still need the API environment to load correctly, including a valid test configuration.

```bash
cd api
npm run test:documents:unit
npm run test:ai:pdf-loader
npm run test:ai:vlm-loader
npm run test:ai:splitter
npm run test:ai:embeddings
npm run test:ai:summary
npm run test:ai:context
npm run test:ai:chat
npm run test:comments:connections
npm run test:comments:broadcast-failure
```

They cover the following areas:

| Script | Coverage |
|---|---|
| `scripts/document-unit.ts` | PDF signature checks, filename normalization, and document input rules. |
| `scripts/pdf-loader-unit.ts` | PDF page ordering, extracted text, empty pages, malformed PDFs, and visual-fallback flags. |
| `scripts/vlm-loader-unit.ts` | Selective visual fallback, page-specific image input, unified text, and provider failures. |
| `scripts/document-splitter-unit.ts` | Chunk ordering, size and overlap rules, page metadata, empty input, and invalid options. |
| `scripts/embedding-retrieval-unit.ts` | Embedding dimensions, provider behavior, and retrieval input validation. |
| `scripts/summary-unit.ts` | Chunk summaries, reduction prompts, final summary sentence limits, and provider failures. |
| `scripts/context-builder-unit.ts` | Page labels, conversation trimming, no-context behavior, prompt grounding, and intent handling. |
| `scripts/chat-service-unit.ts` | Stream token extraction, primary model streaming, fallback before the first token, and partial-stream failure behavior. |
| `scripts/comment-connection-unit.ts` | WebSocket connection registration, removal, and cleanup. |
| `scripts/comment-broadcast-failure.ts` | Removal of sockets that fail during broadcast. |

## Database and integration checks

Start the local dependencies first:

```bash
cd api
docker compose up -d db redis mailpit
```

The test database should have `test` in its name. The database-backed checks reject the normal application database to reduce the chance of deleting or changing local development data.

Set up the test environment and migrations, then run the checks:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name local-test
npm run test:ai:foundation
npm run test:documents:integration
npm run test:ai:embeddings:integration
npm run test:ai:summary:integration
npm run test:ai:context:live
```

These checks verify:

- the `vector` extension and `vector(3072)` embedding storage;
- chunk persistence, retry-safe upserts, and similarity ranking;
- retrieval isolation by document ID;
- conversation and message foreign-key behavior;
- summary persistence and processing status changes;
- grounded context against stored document chunks;
- document storage and cleanup behavior where the configured storage boundary is available.

The live context check uses the configured Gemini embedding key. It creates and removes its own fixtures.

## Backend end-to-end checks

These checks require the API and its dependencies to be available. Mailpit is used locally to read OTP emails without sending them externally.

```bash
cd api
npm run e2e:auth
npm run test:documents:e2e
npm run e2e:sessions
npm run e2e:comments
npm run e2e:comments:websocket
```

| Script | Coverage |
|---|---|
| `scripts/auth-e2e.ts` | Signup, password hashing, email verification, OTP expiry and single use, login gating, JWT claims, protected routes, logout, and Redis revocation. |
| `scripts/document-e2e.ts` | Authenticated document upload, access, and document lifecycle behavior. |
| `scripts/session-e2e.ts` | Share token hashing, invited email verification, guest session TTL, and access to the shared document. |
| `scripts/comments-e2e.ts` | Root comments, replies, guest and owner principals, and authorization. |
| `scripts/comment-websocket-e2e.ts` | WebSocket authorization, connection lifecycle, and comment broadcast between clients. |

## Frontend checks

The web app has one standalone state check:

```bash
cd web
npm run test:comments
```

`scripts/comments-sync.test.ts` checks insertion of root comments, replies, duplicate events, and parent lookup behavior. It tests the state helper directly rather than mounting React components in a browser.

The frontend can also be checked through a production build:

```bash
npm run build
```

The API has corresponding static checks:

```bash
cd api
npm run typecheck
npm run build
```

## Manual smoke path

For a local smoke check, start the stack:

```bash
cd api
docker compose up --build
```

Start the frontend in another terminal:

```bash
cd web
npm run dev
```

Then verify the main path manually:

1. Create an account.
2. Open Mailpit at `http://localhost:8025` and enter the six-digit verification code.
3. Upload a valid PDF.
4. Wait for the processing status to become complete.
5. Open the workspace and confirm that the PDF loads from the authorized API response.
6. Ask a question and confirm that the assistant response arrives through the chat stream.
7. Create a share from the dashboard.
8. Open the invitation link in another browser session and verify the invited email with the OTP.
9. Add a root comment and a reply from the owner or guest session.
10. Confirm that the second connected workspace receives the new comment without a page refresh.
11. Revoke the share and confirm that the guest can no longer access the document.

## What is not covered by the current QA setup

The repository currently has no committed CI workflow, coverage threshold, mutation test configuration, visual regression suite, accessibility audit, load test, or multi-instance WebSocket test. The frontend checks do not exercise the rendered UI in a real browser.

The current automated checks also reflect the architecture's limits:

- document processing is tested in the API process, not through a durable job queue;
- WebSocket broadcasts are tested against the in-memory connection manager;
- S3 behavior depends on the configured AWS boundary rather than a local S3 emulator;
- live AI checks depend on provider credentials and model availability;
- no test should use production credentials or a production database.
