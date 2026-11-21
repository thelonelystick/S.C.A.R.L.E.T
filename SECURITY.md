# Security and operations

## Tenant boundary

Each authenticated query derives user_id from the server session. User-supplied IDs are resource selectors within that tenant. SQL values are parameterized and dynamic table choices use fixed maps. Composite foreign keys prevent cross-tenant relationships. Session cookies are HttpOnly and SameSite=Lax. Public mode adds Secure, disables guests, checks verified email, and requires an explicit origin. Mutations check the full Origin header. Meta webhooks authenticate the unmodified request body separately.

All verified account data is scoped to its owner through application queries. Runtime database credentials can access rows across tenants to operate the shared service. This release relies on application-level enforcement and the deployment's protection of its database credentials. Production isolation testing should cover each addition to the API. The administrator route returns only aggregate counts.

## Credentials and consent

Connection secrets and MFA material use server-side AES-256-GCM. The local master key is generated in a private file. Public operation requires a separately managed key. Back it up independently and plan a re-encryption procedure before rotating it. Records encrypted under a missing key cannot be recovered. Workspace exports omit passwords, session tokens, authenticator seeds, OAuth credentials and provider keys.

Google OAuth uses a short-lived, single-use state bound to the session owner plus PKCE. Disconnecting a Google service calls the provider's revocation endpoint. Check other Google authorizations after revocation. Verify the intended Google service connection before drafting a message. Reconnect or account changes can require a new draft.

Provider calls process user-authorized input. Attachments, relevant memories, email excerpts and business conversation text can leave the server when the operator or account holder enables the corresponding external model. Use local inference for on-device processing when appropriate. Connecting or refreshing services can consume the provider's quota. Model names and connection state are verified against the linked account.

## External actions and untrusted data

External communication is drafted and approved against the displayed revision. Duplicate approvals fail. A selected WhatsApp Business number may auto-reply only under a separately enabled policy. The system rechecks policy at dispatch, binds work to the verified number, and records a unique send reservation. When a provider response is ambiguous, the operator should reconcile the remote account before creating another send.

Research downloads allowlisted public HTTPS documents using a pinned IPv4 destination and TLS hostname checks. Redirects are validated again. Chromium receives inert sanitized data in an offline, private context. The deployment should also restrict outbound network access at its infrastructure boundary. The generic reader does not execute website JavaScript, submit forms or import browser credentials.

The upload limit is 5 MiB per file. Storage reservations are checked under a per-user lock. Parsers validate file contents, enforce expansion limits and normalize images. PDF parsing uses a bounded subprocess. Optional ClamAV scanning fails closed when configured. Upload originals are encrypted at rest in the application. Extracted text, messages, memory, calendar events, and audit records are stored in PostgreSQL. Use encrypted disks, protected backups and controlled access for those fields.

## Public operation

Use HTTPS, the supplied gateway configuration, the separate database roles, private Redis and a dedicated worker. Protect API secrets and backups outside the source tree. TRUST_PROXY may be enabled only with a trusted edge that sets the client header. Enforce request, connection, signup and egress limits at the public edge as well. Model and workflow budgets are application-level limits. Identity challenges expire after 20 minutes. The app caps model output, planning depth, upload size and automated replies.

The default frontend language is English. Voice input may use the browser vendor's online speech service and requires foreground permission. The desktop companion cannot grant operating-system access to the website. The source package contains no production tenant data or credentials.

## Verification boundary

Automated regression tests cover owner isolation, public login, token expiry and replay, TOTP, draft revision conflicts, upload validation, source restrictions and business reply policy. The local live smoke uses Ollama and a public test domain. Public OAuth provider approval, real delivery, infrastructure load, backup restoration, penetration testing, jurisdiction-specific compliance, and independent security review require deployment-specific verification.
