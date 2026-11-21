# Architecture

## Runtime

The Next.js App Router serves the React application and same-origin Node API. The main routes are the landing page, authentication, onboarding, dashboard, chat, voice, browser, WhatsApp, email, calendar, automations, files, memory, integrations, activity, settings and restricted administration. Account-access handles email verification and recovery.

The command center projects a procedural 3D mesh onto canvas. Speech events, local processing and executing workflows drive the core state. The renderer supports reduced motion and pauses when offscreen. Locally bundled fonts and the original sigil keep the artwork independent of external image hosts.

## Identity and storage

PostgreSQL is authoritative. Local development runs embedded PGlite with the vector extension. Deployed web and worker processes use PostgreSQL with pgvector. The versioned SQL files are the migration source of truth. The Prisma schema mirrors the migrated tables. External PostgreSQL session lookup uses the generated ORM client. Parameterized SQL implements queues, vector queries, composite tenant relationships and transactions.

Accounts own hashed sessions, conversations and messages, memories, documents and passages, calendar events, connections, tasks and steps, approvals, notifications and audits. Business-number bindings scope incoming messages, dispatch records, rate reservations and handoffs. Cross-record ownership uses composite foreign keys where two tenant-owned objects must agree. Account deletion cascades through the owned records. Aggregate administration requires the ADMIN role. SUPPORT has no special private-data access through the web API.

Password verification uses salted scrypt. Sessions use random opaque cookies, with only digests stored in PostgreSQL. Public registration verifies email ownership. Recovery consumes a short-lived challenge, checks enrolled TOTP, replaces the password and revokes sessions. MFA enrollment and removal require password reauthentication. Local guest accounts upgrade in place and receive a rotated session.

## Commands and inference

Typed and voice commands share one authenticated endpoint. Direct commands handle memory, reminders, status and research requests. Explicit “Plan and run …” instructions invoke a bounded, typed provider tool call with up to four read or report steps. The server intersects the requested operation with the connected services, available permissions and stated scope. Model output cannot directly select a recipient, approve an action, or execute a shell command.

Conversational replies include recent tenant-owned turns and relevant enabled memory. An explicit conversation recap summarizes a bounded excerpt. Provider modules support OpenAI, Anthropic, Google and operator-approved compatible endpoints. The local demo discovers a model in Ollama's installed model list. Optional route settings select available models for short chat, coding, reasoning or vision. When a configured alternative is unavailable or quota-limited, eligible failures fall back to the workspace's selected model within its request budget.

Passage retrieval ranks normalized file sections locally. Configured OpenAI embeddings support hybrid retrieval in pgvector. The source document and passage numbers accompany evidence sent to the model. Upload bytes, origins and tenant IDs are validated in the API. Images are normalized before vision inference. Each provider sees only the context passed for that task. See [research details](docs/RESEARCH.md).

## Execution and approvals

SQL task records carry payloads, scheduling times, attempts and state. A local timer drains the queue in development. Redis and BullMQ schedule production worker ticks and maintenance. PostgreSQL row claims using FOR UPDATE SKIP LOCKED prevent two workers from claiming one pending job. Queued steps transition through planning and running. Completed results and notifications commit together. Failed reads can retry within a bound. Reminders may schedule a finite daily or weekly successor in the completion transaction.

External sends and Google Calendar writes start in WAITING_FOR_APPROVAL. Edit operations increment a draft revision. Approval checks that exact revision and consumes the pending checkpoint in a transaction. Outbound requests with uncertain delivery are never automatically retried. Business auto-reply uses a separate, explicitly authorized policy including number binding, allowlist, time window, opt-out, handoff, hourly reservations and emergency pause.

The client reads a bounded state snapshot. Authenticated server-sent events announce changes and the client fetches fresh data. A reconnecting browser can reconstruct visible state from the database. The scheduled date, execution log, results and failures appear under Automations. Source captures are read-only browser tasks that run in fresh, sandboxed contexts.

## Extension points

- Add a provider adapter in lib/providers. Model calls, source reports and semantic vectors use central quotas and verification.
- Add a connector descriptor to the catalog, a typed request schema, and a tenant-scoped server handler. New write actions must define their approval or explicit policy boundary. The integration catalog ships with first-party connectors.
- Add a task kind in the executor with a bounded payload and explicit state transitions. Put reversible work before the external effect. Implement a durable deduplication rule before enabling retries for a new effect.
- The entitlement layer accepts administrator-defined plan limits for model usage, workflows and storage. A future billing service can update the server-owned plan field. No checkout or subscription billing runs in the local app.
- The optional Electron companion handles independently enabled local utilities in its own window. Its sandboxed renderer uses a narrow IPC interface. It opens the web dashboard in the system browser.
