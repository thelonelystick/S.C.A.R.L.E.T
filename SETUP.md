# Installation and configuration

## Start the web app

Unpack the ZIP into a directory you own. Open a terminal in the SCARLET-AI directory containing package.json. Use Node 22.16+ and npm. Install development dependencies for builds. The lockfile includes the Prisma client generator and platform-specific libraries used by the document parser.

```sh
npm ci
cp .env.example .env
npm run migrate
npm run dev -- -p 4317
```

Visit [the landing page](http://127.0.0.1:4317/) or [the dashboard](http://127.0.0.1:4317/dashboard). The database and locally generated encryption key live under .scarlet. Keep the database and key together when backing up. Only one local app process should own an embedded database directory. Stop the local server before manually migrating it. Normal local startup applies outstanding migrations. Restart after changing environment settings or adding migrations.

For an optimized local build, stop the development server and run:

```sh
npm run build
npm start -- -p 4317
```

The shell and API use the same origin. Use one loopback hostname consistently. Public mode requires APP_ORIGIN, an external PostgreSQL instance, a protected encryption key, account email delivery, and HTTPS. Use the deployment guide for that topology.

## First session

1. Open the dashboard. A local guest workspace expires after 24 hours. Register from Settings to retain its contents and connect private services.
2. Enter **System status** or **Remember that the release meeting is on Friday**. Built-in commands persist without an inference provider.
3. In Integrations, choose a provider, verify its credential, and select an available model. For on-device chat, run Ollama with a conversational model already installed and LOCAL_MODEL_DISCOVERY enabled before creating a local workspace. LOCAL_MODEL_ID can select a listed model. The local discovery endpoint is fixed to the IPv4 loopback Ollama service.
4. In Files, upload a short TXT, PDF, DOCX, XLSX, CSV, code file or supported image. Ask a question and inspect its grounding. The selected provider receives the indicated source passages or normalized image. A compatible vision model is needed for images.
5. Use Automations for a scheduled reminder or a research report. The app must stay running for the local timer. The remote deployment runs a separate worker. Open the completed record to read its steps, output and sources.
6. Open Voice assistant and start a session to request microphone access. Speech recognition and synthesis depend on browser, permission and installed voices. Typed fallback uses the same authenticated command handler. Hands-free listening is explicit and foreground-only.

## Browser reader

Use an installed Chromium-family browser or install the matching Playwright Chromium:

```sh
npx playwright-core install chromium
```

Leave CHROMIUM_PATH empty for Playwright's installation. On macOS with Google Chrome installed, set its executable path to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Set RESEARCH_HOSTS to exact approved public hostnames. Start with example.org. Run a browser job for https://example.org to inspect its title, text, links and reader capture. See [research configuration](docs/RESEARCH.md).

## External services

| Service | Inputs and account requirements |
| --- | --- |
| OpenAI, Anthropic, Google Gemini | Per-user API key with access to the selected model. Verified in Integrations. Images need a model with vision support. |
| Compatible gateway | Administrator-controlled HTTPS AI_COMPATIBLE_BASE_URL plus a per-user key. The private local Ollama exception requires the explicit local discovery setting. |
| Semantic search | EMBEDDING_MODEL set to an available OpenAI embedding model that supports 1536-dimensional output, plus the tenant's connected OpenAI credential. Lexical retrieval works locally. |
| Brave Search | Per-user Brave Search API key. Connecting it performs one real verification search. |
| Gmail and Google Calendar | Google Cloud OAuth client, enabled APIs and consent configuration. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and the exact GOOGLE_REDIRECT_URI ending in /api/oauth/callback. Each user consents for the selected service. |
| WhatsApp Business | Eligible business number, per-user authorized Graph token, phone number ID, app secret, secret webhook verification token, supported Graph version, and public HTTPS webhook at /api/whatsapp/webhook. |
| Public account email | RESEND_API_KEY and AUTH_EMAIL_FROM on a verified sending domain. Account-access links use APP_ORIGIN. |
| Malware scanning | Optional CLAMAV_SOCKET to a reachable clamd Unix socket. A configured but unavailable scanner rejects uploads. |
| Distributed operation | PostgreSQL + pgvector, Redis, web and BullMQ worker. The supplied Compose file provisions the service topology. |

Credentials entered in Integrations are encrypted server-side. Keep operator configuration in a secret manager or a protected environment file. Additional instructions and API permission scopes appear in [the connector guide](docs/CONNECTORS.md).

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

With a local server running, test against a browser executable through CHROMIUM_PATH. PREVIEW_URL defaults to http://127.0.0.1:4317. The end-to-end check creates a short-lived guest workspace and saves screenshots under test-results/screenshots.

```sh
npm run test:e2e
node --import tsx scripts/live-smoke.ts
```

The optional live smoke requires a working Ollama chat model, an approved example.org browser backend, network access and a sandboxed Chromium installation. The automated contract tests use isolated test data and substitute network transports. Read [the feature report](FEATURE-REPORT.md) for what was exercised during delivery.
