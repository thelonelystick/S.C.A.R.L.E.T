# S.C.A.R.L.E.T. AI

Synthetic Cognitive Assistant for Reasoning, Learning, Execution & Technology.

A multi-user Next.js assistant with a crimson command center, conversational and voice interfaces, a durable task queue, document retrieval, and approval-controlled communication. This repository contains the web application, background worker, database migrations, connectors, tests, infrastructure configuration and optional Electron companion.

## Run locally

Use Node 22.16 or newer. From the directory containing package.json:

```sh
npm ci
cp .env.example .env
npm run migrate
npm run dev -- -p 4317
```

Open [the command center](http://127.0.0.1:4317/dashboard). The first local visit creates an isolated, expiring workspace. Register to keep it. The default database is an embedded PostgreSQL instance with pgvector. Docker and paid accounts are optional for local use.

Try **Remember that I prefer morning meetings**, then **Show my memories**. Create a reminder in Automations, upload a file under Files, or connect an inference model for a conversation. A running local Ollama service with an installed chat model can be discovered on loopback. A model connection is recorded only after successful discovery.

| Guide | Contents |
| --- | --- |
| [Setup](SETUP.md) | Local prerequisites, environment variables, first commands and verification |
| [Architecture](ARCHITECTURE.md) | Auth, tenant isolation, persistence, retrieval, queues and model routing |
| [Security](SECURITY.md) | Trust boundaries, permissions, limits, residual risks and operator controls |
| [HTTP API](docs/API.md) | Request formats, authentication, errors, streams and approval revisions |
| [Connectors](docs/CONNECTORS.md) | Provider setup, OAuth, Meta webhooks, search and policy configuration |
| [Research and files](docs/RESEARCH.md) | Allowed browser sources, extraction, indexing, and file limits |
| [Deployment](docs/DEPLOYMENT.md) | Docker Compose, TLS, migrations, worker, secrets and backups |
| [Feature report](FEATURE-REPORT.md) | Implementation status, verification and remaining priorities |
| [Desktop companion](companion/README.md) | Local controls, independent permissions and native tests |

The optional desktop package has its own lockfile. Core artwork is an original animated 3D projection rendered in canvas. Fonts are bundled locally under their respective open licenses. Lucide supplies interface icons.
