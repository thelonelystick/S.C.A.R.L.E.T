# HTTP API

All paths below are relative to /api. Authenticated calls use the HttpOnly scarlet_session cookie. POST requests require the configured Origin and application/json except for the raw file upload and signed Meta webhook. Resource identifiers refer to the signed-in user's workspace. Read responses disable caching. Errors return a JSON error string and an HTTP status. Typical statuses include 400 for invalid input, 401 for an invalid session, 403 for denied access, 404 for missing owned resources, 409 for stale or incompatible state, 413 for size limits, 422 for unreadable content and 429 for exhausted budgets.

## Identity and workspace

| Method and path | Request or result |
| --- | --- |
| GET health, GET config | Database readiness and availability of local guest mode |
| POST auth/guest | Empty object. Creates or resumes a local isolated guest session. Public deployments require login. |
| POST auth/register | name, email, password (12–160 characters). Public mode returns needsVerification and sends a verification link. Local mode sets a session cookie. |
| POST auth/login, POST auth/logout | Login takes email, password and an optional TOTP code. Logout revokes the session. |
| POST auth/request-link | email and purpose (verify or reset). Sends a single-use short-lived account email. |
| POST auth/confirm | token, purpose, and for reset, password and enrolled authenticator code. Tokens are read from the link fragment in the account-access page. |
| GET state | Bounded workspace snapshot, public user information, task revisions, integration metadata and capabilities |
| GET stream | Authenticated SSE connection. The workspace event tells the client to refresh its snapshot. |
| POST settings | name, style, language, memory, retention in days, or onboarded |
| POST mfa/start, mfa/enable, mfa/disable | Reauthenticate with password. Start returns a manual setup key. Enable and disable verify the current code. |
| GET export, POST account/delete | Download an owned JSON export. Deletion requires password and enrolled TOTP and cascades through workspace records. |
| GET admin | ADMIN-only aggregate counts |

## Conversation, memory and files

| Method and path | Request or result |
| --- | --- |
| POST command | text, optional conversationId, optional documentId. Returns conversationId, text, intent and optional taskId. An unavailable conversational capability produces an explicit assistant error result. |
| GET chats/:id, GET chats/search?q=… | Owned conversation messages or title/content search matches |
| POST suggest | kind (email or whatsapp) and context. Returns an editable draft from the connected model. |
| POST memory | title, body, category and optional id for editing |
| GET memory/export | Download all unexpired owned memories |
| POST files/upload | Raw bytes with Content-Type and URL-encoded filename in X-File-Name. Returns the owned document ID. |
| GET files/:id, GET files/search?q=… | Extracted content or ranked owned passages |
| GET report/chat/:id, GET report/task/:id | Download a conversation or completed workflow result as Markdown |
| POST delete | kind (memory, file, event, conversation) and id |

## Jobs and productivity

| Method and path | Request or result |
| --- | --- |
| POST task | kind (reminder, task, research, browser), title and optional ISO runAt. Research takes query and browser takes url. Repeating reminders take repeat (daily or weekly) and count (2–52). |
| GET tasks/:id | State, payload, displayed revision, steps, result and error |
| POST cancel | id. Queued tasks and running read-only workflows can be cancelled. Dispatched external effects require reconciliation. |
| POST draft | kind (email.send or whatsapp.send), to, body and optional subject. Returns pending workflow ID. |
| POST draft/edit | id, body, revision. Returns the new revision string. |
| POST approve | id and the displayed revision string. Stale edits and approvals return 409. |
| POST event, POST calendar/publish | title, start, end, optional allowConflict for a local overlap. Publication creates an approval. Google busy conflicts are checked before submission. |
| GET email?q=…, GET email/:id, GET calendar | Authorized Gmail search, message read and Google Calendar event list |

## Connectors

| Method and path | Request or result |
| --- | --- |
| POST models | provider and key. Returns available model IDs after discovery. |
| POST connect | kind (model, search, email, calendar, whatsapp). Model takes provider, key and model. Search takes key. WhatsApp takes key and phoneId. Google connectors return a consent URL. |
| GET oauth/callback | Provider redirect. Consumes session-bound state, exchanges the code, checks granted scopes and stores credentials. |
| POST disconnect | kind. Removes the tenant's connection. |
| POST whatsapp/policy | mode, paused, allowlist, excluded, timezone, days, startHour, endHour and maxPerHour. See the connector guide for ranges and reply semantics. |
| POST whatsapp/handoff | contact and paused. Opted-out contacts remain blocked. |
| GET whatsapp/webhook | Meta challenge verification |
| POST whatsapp/webhook | Meta signed raw body with X-Hub-Signature-256. Duplicate messages are ignored. |

Example browser request for a local reminder:

```js
const reply = await fetch('/api/command', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'Remind me in 10 minutes to review the brief' })
})
console.log(await reply.json())
```

The browser supplies the session and Origin on same-origin requests. API consumers must maintain their own signed-in cookie jar and send the exact Origin. Servers never return saved provider keys to the browser.
