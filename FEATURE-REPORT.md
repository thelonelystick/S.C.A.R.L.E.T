# S.C.A.R.L.E.T. AI delivery report

## Delivered application

S.C.A.R.L.E.T. is a working multi-user assistant with an original crimson command center, verified local language-model inference, a database-backed execution engine, user-controlled memory, document retrieval and approval-controlled connectors. The web app, optional desktop app, schemas, migrations, tests, deployment files and setup guides are included in SCARLET-AI-FULL-PROJECT.zip.

The verified preview runs on the development Mac at [127.0.0.1:4317/dashboard](http://127.0.0.1:4317/dashboard). Open [the landing page](http://127.0.0.1:4317/) for the introduction and registration. Loopback links work on the machine running the server. The preview uses the locally installed Ollama model identified by discovery as llama3.2:latest and an embedded PostgreSQL database. Private cloud providers and messaging accounts start disconnected.

## Feature status

“Working” identifies a delivered local feature. “Working with configuration” identifies an implemented path with additional service, permission or infrastructure requirements. The verification column distinguishes live, fixture and untested paths.

| Major feature | Status | Delivered behavior and verification |
| --- | --- | --- |
| Command center, onboarding and navigation | Working | All requested page paths, responsive navigation, module search, original animated core, command bar and activity/status panels. Desktop and mobile browser checks passed. |
| Registration, login, roles and account controls | Working | Password hashing, tenant-scoped sessions, TOTP, preferences, account deletion, workspace export and aggregate administration. Tested across independent accounts. |
| Public email verification and recovery | Working with configuration | Single-use email challenges, expiry, MFA-aware reset and session revocation. Verified with isolated transport fixtures. Public delivery needs a verified Resend domain and credential. |
| AI chat and coding assistance | Working | Local Ollama answered a real two-turn conversation. Includes searchable history, editable style, response language, context, explicit summaries and Markdown download. Coding support produces explanations and suggested code. |
| Model gateway and routing | Working with configuration | OpenAI, Anthropic, Google and compatible adapters, model discovery, task-specific routing, eligible fallback, usage records and budgets. Compatible endpoint exercised live with Ollama. Commercial adapters were contract-tested. |
| Tool planning and execution | Working with configuration | A tool-capable model can propose a bounded read/report plan. The server checks available tools, executes allowed steps and records them. The local Ollama model ran memory.search and report.compose against a saved project fact, and its Markdown export was verified. Structured-call validation and budget restrictions were also tested. |
| Voice and wake activation | Working with configuration | Browser speech recognition, synthesis, interrupt/mute, device voice/language, explicit wake mode, audio rendering and typed fallback. UI tested in Chrome. Physical mic accuracy, speakers and mobile voice support remain device-dependent. |
| Memory and personalization | Working | Tenant-owned memory CRUD, search, expiration, export, preferences, lexical retrieval and opt-in retention. Isolation and deletion tested. |
| Semantic memory and document search | Working with configuration | pgvector plus per-tenant OpenAI embeddings. Cosine ranking and lexical fallback exercised with fixture vectors. A live paid embedding call was not made. |
| Document and image intelligence | Working with configuration | PDF, DOCX, XLSX, CSV, TXT, code, JPEG, PNG and WebP ingestion. Chunked retrieval includes late-file evidence and handles legacy records. TXT question answering exercised live. Image answers require an available vision model. |
| Browser agent | Partially implemented | Real TLS retrieval, DNS checks, bounded redirects, isolated Chromium reader captures, links and source text. A queued read of example.org completed live. Authenticated site interaction, form entry and submissions remain future work. |
| Web research and reports | Working with configuration | Brave-powered source results, optional model synthesis, citations, downloadable Markdown and notifications. Contract tests cover search processing. Live Brave access requires a key. |
| Email | Working with configuration | Google OAuth, Gmail search/read, editable AI suggestions, approved sends, status and receipts. OAuth, content validation and approval flows were tested with fixtures. Live consent, inbox access and sending remain unverified. |
| Calendar | Working | Local events, overlap detection and removal. Time-zone offsets and conflicts tested. |
| Connected Google Calendar | Working with configuration | List and publish events through OAuth, exact draft approvals and remote conflict checks. Adapter tested with fixtures. Live publication requires Google credentials and consent. |
| WhatsApp Business | Working with configuration | Signed inbound messages, Manual/Assisted/Auto modes, number-bound ownership, allowlists, business hours, limits, emergency pause, opt-outs and human handoff. Six database lifecycle cases and connector contracts passed. Live Meta receipt and delivery need an eligible business account. The template-send adapter has no user-facing template editor. |
| Background jobs and reminders | Working | Durable task states, live updates, cancellation, deadlines for remote calls, bounded read retries, due reminders, finite recurring reminders, notifications, revision-bound approval and history. Local queue exercised end to end. |
| Distributed worker and public deployment | Working with configuration | PostgreSQL, pgvector, Redis, BullMQ, Docker Compose, restricted DB roles, TLS proxy and GitHub Actions workflow supplied. Compose configuration and SQL privileges validated. Docker-backed runtime, public hostname, live TLS and hosted CI remain unverified here. |
| Connectors and marketplace | Partially implemented | Extensible first-party catalog, provider modules, verified connection metadata and disconnect controls. Third-party plugin installation and a marketplace are not implemented. |
| Desktop companion | Partially implemented | Optional sandboxed Electron utility with per-capability permission, OS pickers, text read/create, filename search, dashboard launch, notifications, disconnect and visible activity. Native macOS window smoke and three fixture tests passed. Web-to-desktop automation, signed installers and cross-platform live checks remain open. |
| Accessibility and localization | Partially implemented | Keyboard navigation, reduced motion, accessible inputs, responsive layouts, configurable response and voice language. English interface. Automated accessibility scans covered four primary pages. Full translation and assistive-device testing remain open. |
| Observability, quotas and billing | Partially implemented | Per-user audit feed, model usage, durable notifications, task inspection, bounded requests and plan-based quotas. External monitoring and payment checkout are not implemented. |
| General computer control and arbitrary code execution | Not implemented | Broad native control is outside the delivered capability set. The companion's local utilities and the server's approved tools provide the available actions. |

## Verification

- The optimized Next.js build, strict TypeScript check and ESLint passed.
- All 41 web/backend regression cases passed with zero skips. They cover tenant isolation, authentication, public verification, MFA, expired and replayed links, concurrency, stale approvals, business policy, quotas, source restrictions, actual Chromium capture, office parsers, passage retrieval and image normalization.
- The optional companion passed three additional tests and a native macOS window smoke test. The test did not select personal files, launch an external browser, or send an OS notification.
- Live acceptance on this Mac exercised local model discovery, a multi-turn reply, a structured tool plan, Markdown export, a grounded answer from an uploaded file, a queued public-source inspection, its JPEG reader capture, and the completion notification.
- Browser checks exercised command entry, memory retrieval, module search, all primary workspace routes, mobile navigation and viewport overflow. Four Axe scans reported zero serious or critical findings for the selected WCAG A/AA rules on Dashboard, Chat, Voice and Integrations. This is a bounded automated check.
- The runtime lockfile returned zero reported vulnerabilities in npm's production audit during preparation. Advisory databases can change. Production penetration testing and load testing remain open.

## Screenshots

[Landing](screenshots/01-landing.png) · [Dashboard](screenshots/02-dashboard.png) · [AI chat](screenshots/03-chat.png) · [Voice](screenshots/04-voice.png) · [Integrations](screenshots/05-integrations.png) · [Mobile dashboard](screenshots/06-mobile.png)

## Run and deploy

From the extracted SCARLET-AI directory run:

```sh
npm ci
cp .env.example .env
npm run migrate
npm run dev -- -p 4317
```

The package contains SETUP.md, ARCHITECTURE.md, SECURITY.md, docs/API.md, docs/CONNECTORS.md, docs/DEPLOYMENT.md and companion/README.md. Those guides cover environment variables, credentials, secret handling, verification, and the Docker or managed-service deployment path.

## Next development priorities

1. Validate Google OAuth, Resend, Brave and Meta in operator-owned staging accounts. Exercise token revocation, inbound webhooks, opt-out, time-window expiry, duplicate delivery and human handoff on those real services.
2. Run the distributed deployment on its target Linux host. Test public TLS, worker restarts, backup and restore, independent tenant isolation, operational monitoring and realistic concurrency.
3. Expand interactive browsing through narrowly defined site actions and explicit review of submissions. Add conversation delivery receipts and a reviewed WhatsApp template workflow.
4. Test real microphones, interruptions and assistive technology on target browsers. Add translated UI catalogs and signed desktop installers for supported platforms.
