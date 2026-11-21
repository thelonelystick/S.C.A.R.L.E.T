# Deploying S.C.A.R.L.E.T.

## Choose the environment

Use the Node development instructions in SETUP.md for the embedded PostgreSQL preview. Docker Compose runs the application against PostgreSQL 16 with pgvector and a dedicated Redis-backed BullMQ scheduler. It needs a Linux container engine, Docker Compose v2 with completion dependencies, and internet access during image and browser installation. On macOS, Docker Desktop provides the Linux engine.

The Compose deployment builds two container targets from the same source and lockfile. Both application processes run as the unprivileged Node user. The web target includes the PDF extraction subprocess and production npm dependencies. The worker target adds the version-matched Playwright Chromium installation. The web service binds to host loopback on port 3000. PostgreSQL and Redis listen only on a private Docker network.

## Prepare a fresh installation

From the extracted project directory, run the following block **once**. It creates a new private directory next to the source tree. The directory protects the files on the host. Readable secret files inside it support bind mounts into non-root containers even when host and container user IDs differ. Use your platform secret manager for managed hosting. Back up the encryption key independently before saving third-party credentials.

```sh
(
  set -eu
  cfg="$(pwd -P)/../scarlet-secrets"
  umask 077
  mkdir -m 700 "$cfg"
  for name in pg-owner-password pg-migration-password pg-app-password redis-password; do
    openssl rand -hex 32 > "$cfg/$name"
  done
  openssl rand -base64 32 > "$cfg/master-key"
  touch "$cfg/connectors.env" "$cfg/auth.env"
  curl --fail --location --silent --show-error --retry 3 \
    https://raw.githubusercontent.com/microsoft/playwright/v1.64.0/utils/docker/seccomp_profile.json \
    -o "$cfg/chromium-seccomp.json"
  chmod 444 "$cfg"/*
)
```

Use the tagged browser profile matching package-lock.json. It retains system-call filtering and permits the user namespaces used by Chromium's sandbox. The worker uses a private shared-memory allocation and drops Linux capabilities. A host kernel that disallows browser user namespaces can block inspections. Verify an allowlisted page on the intended host with the sandbox enabled. [Playwright container configuration](https://playwright.dev/docs/docker)

For a different directory, set `SCARLET_SECRETS_DIR` and `SCARLET_SECCOMP_PATH` to absolute paths in the operator's environment. The latter points to the downloaded JSON on the machine running Compose. Keep both paths outside the source checkout. [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)

## Start on localhost

```sh
docker compose config --quiet
docker compose up --build --detach --wait --wait-timeout 300
docker compose ps --all
curl --fail http://localhost:3000/api/health
```

Open `http://localhost:3000`. The local Compose default enables isolated guest workspaces. Use the same hostname as `APP_ORIGIN` when signing in or submitting actions. A passed web health check means PostgreSQL answered a query. The worker health check verifies the BullMQ scheduler and a registered worker. For an end-to-end check, schedule an immediate reminder and verify its completion in Activity.

| Stage | Dependencies and permissions |
| --- | --- |
| PostgreSQL | Named data volume, password-authenticated access and availability probe |
| Redis | Named data volume, append-only persistence, password authentication and no key eviction |
| Database bootstrap | Runs after PostgreSQL is healthy. Creates the vector extension, limited login roles and schema grants using the owner credential |
| Migration job | Uses the migration role to apply versioned SQL under a database lock, then exits |
| Next.js and worker | Start after Redis is healthy and migrations finish successfully. Use the application role for data access. Runtime migration checks are disabled |
| Optional Caddy | Starts after the web health check succeeds and keeps its TLS state in persistent volumes |

The application role has table data access. Schema creation belongs to the migration role. The bootstrap credential is mounted into PostgreSQL and its one-shot setup container. The application and worker receive the separate application password, Redis password, shared encryption key and connector configuration. The worker's repeating queue jobs wake the durable SQL task engine and run periodic maintenance. [Compose dependency conditions](https://docs.docker.com/compose/how-tos/startup-order/) · [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production) · [pgvector images](https://github.com/pgvector/pgvector#docker)

## Enable public HTTPS

1. Point DNS for a hostname you own at the server. Open TCP ports 80 and 443 for Caddy. UDP 443 supports HTTP/3. Keep application, cache and database ports private.
2. Set `PUBLIC_DEPLOYMENT=1`, `SCARLET_HOST` to the hostname, and `APP_ORIGIN` to its exact HTTPS origin without a trailing slash. Set `TRUST_PROXY=1` only when the host's trusted reverse proxy controls incoming forwarded-client headers. The public setting enables secure session cookies and account-only access.
3. For public registrations and password resets, verify a sending domain in Resend and set `RESEND_API_KEY` and `AUTH_EMAIL_FROM` in the protected `auth.env` file. Only the web service receives that file. Use a sender address on the verified domain. The application builds verification and recovery links under `APP_ORIGIN/account-access`. Open a delivered link and test both flows before enabling sign-ups. Local registration works without an email provider.
4. Add provider configuration as needed. Put `GOOGLE_CLIENT_SECRET`, `META_APP_SECRET` and `META_VERIFY_TOKEN` in the private `connectors.env` file as Node environment-file assignments. Configure identifiers and optional model settings through Compose environment values such as `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, `META_GRAPH_VERSION`, `EMBEDDING_MODEL` and `RESEARCH_HOSTS`. Use the application's account-scoped integration forms for model keys, search keys and business phone credentials.
5. Start the HTTPS profile. Then verify registration, login, the health endpoint and a queued task from the public hostname.

```sh
export PUBLIC_DEPLOYMENT=1
export SCARLET_HOST=assistant.example.org
export APP_ORIGIN="https://$SCARLET_HOST"
export TRUST_PROXY=1
docker compose --profile https up --build --detach --wait --wait-timeout 300
curl --fail "$APP_ORIGIN/api/health"
```

Replace the example hostname with your own. The supplied Caddyfile proxies to `web:3000`, issues certificates through Caddy's HTTPS automation and adds HSTS. For an existing platform ingress, point its TLS-terminated backend to the web service and preserve the external origin. [Caddy HTTPS setup](https://caddyserver.com/docs/quick-starts/https)

## Managed infrastructure

Deploy the Dockerfile's `app` and `worker` targets as separate continuous services. Use a dedicated PostgreSQL database with pgvector installed, a migration role with schema creation privileges and a separate runtime role with table privileges. Supply `DATABASE_URL` per service, `REDIS_URL` for the web and worker, and the same base64 32-byte `SCARLET_MASTER_KEY` on both. Use verified TLS for off-host PostgreSQL and Redis connections. The worker accepts `rediss://`. Keep provider secrets in the runtime secret manager.

Run `npm run migrate` as a release job using the migration credential. Start the web and worker only after that process exits successfully. The web image starts Next on port 3000. The worker image starts `scripts/worker.ts`. Supply the browser namespace policy to the worker workload if source inspection is enabled. Configure `PUBLIC_DEPLOYMENT=1` and the exact `APP_ORIGIN` on both services. Configure a shared ClamAV Unix socket with `CLAMAV_SOCKET` if file scanning is available. Compose leaves external scanning unconfigured.

## Operations and verification

- Keep the PostgreSQL volume, encryption key and Caddy state in the backup plan. Test restoring the database and original encryption key together. The master key currently encrypts integration credentials and uploaded source files. Changing it requires a coordinated re-encryption process.
- Inspect `docker compose logs --tail 100 migrate web worker` for startup failures. Observe task states in Activity, confirm the scheduler is healthy, and reconcile interrupted external sends with the provider. Database credentials and provider secrets should never be included in support logs.
- For a release, back up the database, build the images, then run the versioned migration job before replacing the runtime services. Plan downtime if a migration is incompatible with the currently serving code. Test the release with the target PostgreSQL major version.
- `docker compose down` stops the stack and preserves its named volumes. Rotate passwords through the database or Redis service and update the corresponding protected configuration consistently. Avoid regenerating a master key for an existing deployment.
- The manifest passed Docker Compose v2.39.4 validation with the HTTPS profile. Embedded PostgreSQL checks exercised migrations as the migration role and confirmed the application role can write application data while lacking schema creation privileges. The CI workflow checks types, lint, tests, a production Next build and browser interactions. Its Docker job exercises startup dependencies, schema privileges, pgvector, an actual queued application task and Caddy configuration using disposable services. This delivery environment has no Docker daemon. Image builds, Linux sandbox behavior, Redis/BullMQ end-to-end execution, ACME certificate issuance and live provider callbacks require verification on the deployment host.
