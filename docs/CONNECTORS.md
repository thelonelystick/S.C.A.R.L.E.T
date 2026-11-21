# Configuring external services

The adapters in `lib/connectors.ts` run in the Node server. Their functions accept credentials supplied by the application. Discovery, reads, and sends go to the provider. The local installation can exercise workspace features independently of these services. A production operator needs an eligible account, appropriate scopes, billing where required, and network access for each enabled service.

## Language models

Choose OpenAI, Anthropic, Google Gemini or an administrator-configured OpenAI-compatible gateway. Use an API key issued by the provider. Each connection can call its provider's model listing to discover real IDs. Select a conversational model that the account can invoke. A model appearing in a general model catalog can still reject a particular modality or API.

| Adapter | Generation endpoint | Model discovery |
| --- | --- | --- |
| OpenAI | Official JavaScript SDK, Responses API, provider-side response storage disabled | OpenAI models list |
| Anthropic | Messages API, pinned protocol version `2023-06-01` | Models API with cursor pagination |
| Google | Gemini Developer API `generateContent` | Filters the catalog for content-generation support |
| Compatible | OpenAI SDK Chat Completions | Provider must implement the OpenAI-compatible models endpoint |

The compatible adapter uses `AI_COMPATIBLE_BASE_URL`, an operator-selected HTTPS URL for the API root. Use a gateway you trust with prompts and its own key. The endpoint is never supplied by a chat message. Outputs include text and reported token counts. Input is limited to 128 messages, 140,000 text characters and supported JPEG, PNG or WebP image input. A response defaults to 1,200 output tokens and can be capped at up to 4,096. Provider content policy, regional support, tokenization and billing rules still apply. External generation costs require provider-side budgets as well as application quotas.

Model output supplies text to the caller. The adapter does not execute instructions embedded in outputs, email, search results or attachments. Expose additional tools through the application authorization and approval path. See the [OpenAI Responses reference](https://developers.openai.com/api/reference/resources/responses/methods/create), [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create) and [Gemini content API](https://ai.google.dev/api/generate-content).

### Tool planning and semantic memory

The planner calls a provider-native function that proposes a read-only workspace plan. It accepts one to four steps drawn from the server-supplied permissions. The handler validates every argument and the number of steps before execution. Public search, authorized email or calendar reads, memory or file searches, and report composition are the available operations. Planning works with supported tool-capable OpenAI, Anthropic, Gemini and compatible models. [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling) · [Anthropic tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) · [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)

Set `EMBEDDING_MODEL` to an accessible OpenAI embeddings model that supports an explicit output length of 1,536. Each call verifies the configured model using the workspace's OpenAI key before requesting its vector. Store the model ID with each vector. Rebuild affected embeddings or exclude old rows from similarity queries when changing models. Memory excerpts sent for embedding or generation are disclosed to the selected provider. [OpenAI embeddings API](https://developers.openai.com/api/reference/resources/embeddings/methods/create)

## Google Workspace

1. In Google Cloud, create a project and enable the Gmail API and Google Calendar API.
2. Configure the OAuth consent screen, test users during development, and the necessary review for public access.
3. Create a Web application OAuth client. Register the exact callback served by the application and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` on its server. Use HTTPS for deployed callbacks. A loopback HTTP callback is supported locally.
4. Begin consent for the requested action. The adapter generates a cryptographic state and PKCE verifier. Store both server-side against the initiating authenticated session, consume once on callback, and enforce expiry. Exchange the code on the server. Check the scopes Google granted before enabling the action.
5. Store access and refresh tokens using tenant-scoped encrypted storage. Renew an expiring access token using the grant's refresh token. Google can omit a replacement refresh token or scopes during refresh. Preserve the previous values when those fields are absent.

| Permission | Requested Google scope suffix | Adapter use |
| --- | --- | --- |
| Read email | `gmail.readonly` | Search ten messages, read headers, snippets and bounded plain-text message bodies |
| Send email | `gmail.send` | Submit a reviewed text email to one recipient |
| Read calendar | `calendar.events.owned.readonly` | List upcoming events on the primary calendar |
| Create event | `calendar.events.owned` | Check for overlapping busy events, then create a timed primary-calendar event |

Email bodies are plain text. The reader uses the snippet when a message has no plain-text part. Calendar times require UTC or an explicit numeric offset. The listing returns up to 50 events. Before creating an event, a separate availability check examines up to 250 overlaps and declines creation if more results remain. Provider-side changes during event creation can still introduce overlaps. Sending email and creating events require an exact, user-approved draft in the calling application. If a network error leaves the outcome uncertain, inspect the provider's sent folder or calendar before another submission. [Web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) · [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending) · [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)

## WhatsApp Business Cloud API

Use a Meta app with WhatsApp enabled, a registered Business Platform phone number, a token with `whatsapp_business_messaging` and the phone-number access required for the setup check. Set `META_GRAPH_VERSION` to a supported version for the app, such as `v27.0`. Store the Meta app secret and webhook verify token on the server. Keep each verified phone ID associated with exactly one workspace, and confirm the phone using Meta before assigning it. [WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/)

Set `META_APP_SECRET` and `META_VERIFY_TOKEN` on the server. Set the public HTTPS callback `/api/whatsapp/webhook` in Meta and subscribe to messages for the appropriate WhatsApp Business Account. The verification helper validates the GET challenge. For POST notifications, give `verifyWhatsAppSignature` the original bytes and `X-Hub-Signature-256` before parsing the JSON. Route signed notifications using Meta's phone ID and deduplicate message IDs before processing. The parser supports inbound text and flags common English opt-out and human handoff keywords. It ignores other message types and delivery-status receipts. [Meta webhook setup](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)

The text-send adapter requires a customer message in the preceding 24 hours. Load its timestamp from the signed inbound history for this recipient and phone. The template adapter supports approved templates with an approved locale and optional positional body text parameters. Template initiation requires a recorded opt-in. Both send methods return Meta's accepted message ID. Delivery or read receipts require separate handling. The integrated worker applies schedules, contact permissions, rate limits, human handoff and approval. The template-send API is available at adapter level. The workspace UI sends customer-window text messages. A personal account can still use a manually copied draft. [Text message reference](https://www.postman.com/meta/whatsapp-business-platform/request/8gvd47s/send-text-message) · [Template reference](https://www.postman.com/meta/whatsapp-business-platform/request/q2k7j58/send-sample-text-message)

### Automatic reply eligibility

The policy checker requires explicit automatic mode, an enabled policy, an allowlisted contact, a current customer service window and a remaining hourly budget. A contact exclusion, opt-out or human handoff blocks automation. Configure an IANA time zone, days numbered Sunday 0 through Saturday 6, start and end hours and a limit between 1 and 60 automatic replies per hour. Overnight shifts extend into the following local day. Start 0 and end 24 cover a full day. The worker matches signed inbound messages to the active tenant and business number. It deduplicates provider IDs, reserves a rolling hourly slot, and rechecks the policy after text generation. A single committed dispatch reservation precedes each external send. Pausing stops queued work and blocks a generated reply before dispatch. A request already dispatched to Meta may still arrive. An interrupted send stays eligible for provider-log reconciliation only.

Manual mode lets the operator edit and approve a draft. Assisted mode can use the configured model to suggest a response to a new inbound message. Each suggestion becomes a separate editable approval. In automatic mode, eligible contacts receive AI-generated replies labeled as automated. For both generation modes, up to six messages from that customer and business number are sent to the workspace's configured model.

A contact can reply STOP to opt out or HUMAN to request handoff. The operator can release a human handoff in the WhatsApp workspace. Opt-outs persist and require a separate, verified consent process to reverse. Reconnecting or replacing a number cancels old pending delivery approvals and clears its automatic-reply grant. Before-binding webhook messages are ignored to avoid exposing another owner's messages after number transfer. Legacy messages lacking a business number cannot open a new customer window.

## Web search

Use a Brave Search API subscription key with Web Search access. The adapter submits the user's query to Brave and returns up to five result titles, HTTP(S) source URLs and snippets. Render the returned source links alongside the answer. Search results are untrusted context. The search adapter retrieves snippets, while page extraction requires the separate browser workflow. Review the provider plan's rights and retention terms before persisting search results. [Brave Web Search documentation](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started)

## Running the adapters

The transport limits response size, uses request deadlines, disables shared caching and rejects redirects. Sends use a single attempt. Failures return bounded service messages so the client never receives raw provider diagnostics or access tokens. Use the deployment's own provider test accounts to complete end-to-end consent, generation, webhook and delivery verification before launch.

The local Ollama planner constrains output against the permitted JSON schema and validates it again before tool dispatch. [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
