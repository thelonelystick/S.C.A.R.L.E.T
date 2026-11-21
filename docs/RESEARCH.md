# Research viewer and document ingestion

## Read a public source

Set `RESEARCH_HOSTS` to a comma-separated list of exact public hostnames the operator trusts for anonymous, read-only research. For example, `example.org,developer.mozilla.org`. Set `CHROMIUM_PATH` to a compatible installed Chromium or Chrome executable, or install the browser revision matching the pinned Playwright version with `npx playwright-core install chromium`. Both the web and worker processes that run browser tasks need this configuration. Run the service as a non-root OS user with a working Chromium sandbox.

The browser task downloads one bounded HTML document over HTTPS. Each redirect passes the same allowlist and public IPv4 checks. The TLS connection uses the selected numeric address and verifies the source hostname. Requests carry no user cookies, API keys, or account tokens. The total download budget is 12 seconds and 768 KiB. The reader accepts up to three redirects and two simultaneous inspections per process.

Playwright starts a fresh sandboxed browser and offline context for each task. It parses the downloaded HTML as an inert document, extracts a title, up to 20,000 characters and 16 HTTPS link references, and renders escaped plain text in a reader view. The returned JPEG captures that view. The source URL accompanies the result for attribution. Following another link starts a new checked request. Web content and upload text are untrusted evidence whenever they are passed to a model. They confer no tool permissions.

Sites that require sign-in, client-side rendering, a browser fingerprint, nonstandard ports, IPv6-only connectivity, or large responses may be unavailable. Interactive form entry, external submissions, shopping, account sessions and general-purpose browser scripting are outside this implementation. Search and synthesis use the separately configured search/model connectors.

Operators should restrict network egress at the service boundary, including cloud metadata endpoints and internal routes, and set limits for worker processes. Some public IPs can route to organization-specific infrastructure. An allowlist should exclude internal or state-changing GET endpoints. [Playwright browser contexts](https://playwright.dev/docs/api/class-browsercontext) · [Node HTTPS options](https://nodejs.org/api/https.html)

## Ingest a file

`extractDocument(name, bytes, mime)` validates an upload of up to 5 MiB and returns normalized text or a re-encoded image. The application must enforce the authenticated user's storage quota and the body size limit before buffering multipart input. Suggested reverse proxy allowance is 6 MiB per request to accommodate multipart framing.

| Input | Extraction |
| --- | --- |
| UTF-8 TXT, Markdown, CSV, JSON, supported source code | Validates UTF-8 and excludes binary control characters. Retains up to 120,000 characters. |
| PDF | Extracts text from the first 40 pages in a separate Node process with a 15-second timeout and a 192 MiB V8 old-space limit. Password-protected and image-only PDFs require prior processing. |
| DOCX | Extracts the main document's paragraph text, line breaks, and tabs. |
| XLSX | Extracts sheet names, cell references, stored values, inline and shared strings, and formula text. Formulas use their cached values. Formatting, charts, Excel date formatting, and recalculation are unavailable. |
| PNG, JPEG, WebP | Validates and decodes a single frame under 16 megapixels, corrects orientation, strips metadata, and returns a JPEG fitting 1,600 × 1,600 pixels. The model connector determines whether vision is available. |

Office ingestion reads selected XML parts in memory. It enforces a maximum of 512 ZIP entries, 16 MiB of declared expanded size across the archive, and 3 MiB per XML part. It enforces a real inflate limit and validates checksums for every part it opens. It rejects macro payloads, embeddings, unsafe archive paths and custom XML entities. Extracted spreadsheets contain values and addresses suitable for document grounding.

Set `CLAMAV_SOCKET` to a Unix socket served by a trusted local `clamd` instance to scan the original bytes with INSTREAM before parsing. Configure `StreamMaxLength` at or above the upload limit. When the socket is configured, any scanning error rejects the upload. An unset socket disables scanning. The PDF parser uses `lib/extractors/pdf.cjs` from the runtime working directory, so include this file and `pdf-parse` in deployments. [ClamAV daemon protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html) · [pdf-parse](https://github.com/mehmet-kozan/pdf-parse)

## Verification

Run `node --import tsx --test tests/research-files.test.ts` from the project directory. Set `CHROMIUM_PATH` to exercise real Chromium offline screenshot capture in addition to the file and address validation tests. Local verification included this full suite and an HTTPS inspection of `https://example.org/`, which returned its title, 156 characters of source text, and a reader screenshot. Antivirus scanning requires an operator-managed daemon.

## Find evidence inside uploaded files

In **Files**, choose **File contents**, enter a term or question, then select **Search contents**. A result opens the source file and its numbered passage. `GET /api/files/search?q=...` accepts up to 400 characters and returns up to six owned passages with `documentId`, `name`, `part`, and `body`. The server permits 120 search submissions per workspace per ten minutes.

A successful text upload is committed before indexing. The index covers up to 120,000 normalized characters using at most 64 overlapping passages. PostgreSQL ranks terms using a GIN full-text index. File questions retrieve relevant passages from the selected document and request passage-number citations from the configured model. A general question with no terms in common uses a sample spread from beginning to end. A model may omit a citation or reach an incorrect conclusion from an excerpt. Image questions continue to send the normalized image to a vision-capable model.

If `EMBEDDING_MODEL` is configured and the owner has connected OpenAI, up to three evenly spaced passages from each new file are embedded. Queries can add semantic matches through pgvector cosine distance alongside keyword matches. Embeddings share the 80-request daily per-user embedding quota with memory. Submitting the same file ID for indexing again does not embed passages a second time. Changing the embedding model leaves previously generated vectors associated with their original model. Library search uses only matching-model vectors and retains keyword matches when a provider fails or the quota is exhausted.

Files created before indexing, or retained after an indexing failure, remain accessible. Search ranks up to six matching older documents per query locally, and asking about a specific older file examines its full normalized text. Reading these documents never triggers a paid vector backfill. Deleting a file or account cascades to its passages.
