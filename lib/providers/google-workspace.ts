import { createHash, randomBytes } from "node:crypto";
import {
  bearer,
  ConnectorError,
  postJson,
  requestJson,
  requiredEnv,
} from "./http";

const authRoot = "https://www.googleapis.com/auth/";
export const googleScopes = {
  "gmail.read": authRoot + "gmail.readonly",
  "gmail.send": authRoot + "gmail.send",
  "calendar.read": authRoot + "calendar.events.owned.readonly",
  "calendar.write": authRoot + "calendar.events.owned",
} as const;
export type GoogleScope = keyof typeof googleScopes;
export type GoogleToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes: string[];
};

function googleClient() {
  return {
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
  };
}

function redirectURI() {
  const value = requiredEnv("GOOGLE_REDIRECT_URI");
  const url = new URL(value);
  const local =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "[::1]";
  if (
    !(url.protocol === "https:" || (local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new ConnectorError(
      "Google OAuth",
      "Configure a valid callback URL on the server.",
    );
  }
  return value;
}

// Persist state and verifier together against this session, with one-time use and short expiry.
export function beginGoogleOAuth(scopes: GoogleScope[]) {
  if (!scopes.length || scopes.some((s) => !Object.hasOwn(googleScopes, s)))
    throw new ConnectorError("Google OAuth", "Select a supported permission.");
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: googleClient().client_id,
    redirect_uri: redirectURI(),
    response_type: "code",
    scope: [...new Set(scopes.map((s) => googleScopes[s]))].join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  }).toString();
  return { url: url.href, state, verifier };
}

async function googleToken(
  params: Record<string, string>,
): Promise<GoogleToken> {
  const result = await requestJson<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  }>("Google OAuth", "https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ ...googleClient(), ...params }),
  });
  if (
    typeof result.access_token !== "string" ||
    !Number.isFinite(result.expires_in) ||
    result.expires_in <= 0
  ) {
    throw new ConnectorError(
      "Google OAuth",
      "Google returned an invalid token response.",
      502,
    );
  }
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + result.expires_in * 1000,
    scopes: (result.scope ?? "").split(" ").filter(Boolean),
  };
}

export function exchangeGoogleCode(code: string, verifier: string) {
  if (!code || !/^[\w-]{43,128}$/u.test(verifier))
    throw new ConnectorError("Google OAuth", "Restart the authorization flow.");
  return googleToken({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: redirectURI(),
  });
}

export function refreshGoogleToken(refreshToken: string) {
  if (!refreshToken)
    throw new ConnectorError(
      "Google OAuth",
      "Reconnect this account to renew access.",
      401,
    );
  return googleToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function revokeGoogleToken(token: string) {
  await requestJson(
    "Google OAuth",
    "https://oauth2.googleapis.com/revoke",
    { method: "POST", body: new URLSearchParams({ token }) },
    16_000,
    true,
  );
}

const gmail = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
type GmailPayload = {
  mimeType?: string;
  body?: { data?: string };
  headers?: { name: string; value: string }[];
  parts?: GmailPayload[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPayload;
};

function emailSummary(m: GmailMessage) {
  const headers = m.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  return {
    id: m.id,
    threadId: m.threadId,
    from: header("from"),
    subject: header("subject"),
    date: header("date"),
    snippet: (m.snippet ?? "").slice(0, 1200),
    unread: m.labelIds?.includes("UNREAD") ?? false,
  };
}

function validGmailId(id: string) {
  if (!/^[\w-]{1,256}$/u.test(id))
    throw new ConnectorError("Gmail", "Invalid message ID.");
  return encodeURIComponent(id);
}

export async function listEmail(accessToken: string, query = "in:inbox") {
  const url = new URL(gmail);
  url.search = new URLSearchParams({
    q: query.slice(0, 500),
    maxResults: "10",
  }).toString();
  const headers = bearer(accessToken);
  const index = await requestJson<{ messages?: { id: string }[] }>(
    "Gmail",
    url,
    { headers },
  );
  return Promise.all(
    (index.messages ?? []).slice(0, 10).map(async ({ id }) => {
      const item = new URL(gmail + "/" + validGmailId(id));
      item.searchParams.set("format", "metadata");
      for (const name of ["From", "Subject", "Date"])
        item.searchParams.append("metadataHeaders", name);
      return emailSummary(
        await requestJson<GmailMessage>("Gmail", item, { headers }),
      );
    }),
  );
}

export async function readEmail(accessToken: string, id: string) {
  const m = await requestJson<GmailMessage>(
    "Gmail",
    gmail + "/" + validGmailId(id) + "?format=full",
    { headers: bearer(accessToken) },
    4_000_000,
  );
  let body = "";
  const pending: GmailPayload[] = m.payload ? [m.payload] : [];
  while (pending.length && body.length < 20_000) {
    const part = pending.pop()!;
    if (part.mimeType === "text/plain" && part.body?.data)
      body += Buffer.from(part.body.data, "base64url").toString("utf8") + "\n";
    if (part.parts) pending.push(...part.parts.slice(0, 100).reverse());
  }
  return {
    ...emailSummary(m),
    body: body.trim().slice(0, 20_000) || m.snippet || "",
  };
}

export type MailDraft = { to: string; subject: string; body: string };
export function validateMailDraft(draft: MailDraft) {
  const address =
    /^[A-Z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/iu;
  if (
    !address.test(draft.to) ||
    draft.to.length > 254 ||
    /[\r\n]/u.test(draft.to)
  )
    throw new ConnectorError(
      "Gmail",
      "Enter a single valid recipient address.",
    );
  if (
    !draft.subject ||
    draft.subject.length > 200 ||
    /[\r\n\x00]/u.test(draft.subject)
  )
    throw new ConnectorError(
      "Gmail",
      "Enter a single-line subject up to 200 characters.",
    );
  if (!draft.body.trim() || draft.body.length > 50_000)
    throw new ConnectorError(
      "Gmail",
      "Enter a message up to 50,000 characters.",
    );
}

// Invoke only with a server-owned draft whose exact contents the user approved.
export async function sendEmail(accessToken: string, draft: MailDraft) {
  validateMailDraft(draft);
  const subjectWords: string[] = [];
  let word = "";
  for (const char of draft.subject) {
    if (Buffer.byteLength(word + char) > 42) {
      subjectWords.push(word);
      word = "";
    }
    word += char;
  }
  if (word) subjectWords.push(word);
  const subject = subjectWords
    .map((part) => "=?UTF-8?B?" + Buffer.from(part).toString("base64") + "?=")
    .join("\r\n ");
  const encoded =
    Buffer.from(draft.body.replace(/\r\n|\r|\n/g, "\r\n"), "utf8")
      .toString("base64")
      .match(/.{1,76}/g) ?? [];
  const raw = [
    "To: " + draft.to,
    "Subject: " + subject,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...encoded,
  ].join("\r\n");
  const result = await requestJson<{ id: string; threadId: string }>(
    "Gmail",
    gmail + "/send",
    postJson(bearer(accessToken), {
      raw: Buffer.from(raw).toString("base64url"),
    }),
  );
  if (!result.id)
    throw new ConnectorError(
      "Gmail",
      "Delivery status is unknown. Check Sent before retrying.",
      502,
    );
  return { id: result.id, threadId: result.threadId };
}

const calendar =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
type GoogleEvent = {
  id: string;
  summary?: string;
  status?: string;
  transparency?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  htmlLink?: string;
};
export type EventDraft = { summary: string; start: string; end: string };

function instant(value: string) {
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/u.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new ConnectorError(
      "Calendar",
      "Use a date and time with an explicit time zone.",
    );
  }
  return new Date(value).toISOString();
}

function calendarRange(start: string, end: string) {
  const timeMin = instant(start);
  const timeMax = instant(end);
  if (timeMax <= timeMin)
    throw new ConnectorError(
      "Calendar",
      "The event must end after its start time.",
    );
  return { timeMin, timeMax };
}

function presentEvent(event: GoogleEvent) {
  return {
    id: event.id,
    summary: event.summary ?? "Busy",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    allDay: Boolean(event.start?.date),
    busy: event.transparency !== "transparent",
    link: event.htmlLink ?? "",
  };
}

export async function listEvents(
  accessToken: string,
  start = new Date().toISOString(),
  end = new Date(Date.now() + 30 * 86_400_000).toISOString(),
) {
  const url = new URL(calendar);
  url.search = new URLSearchParams({
    ...calendarRange(start, end),
    maxResults: "50",
    singleEvents: "true",
    orderBy: "startTime",
  }).toString();
  const result = await requestJson<{ items?: GoogleEvent[] }>("Calendar", url, {
    headers: bearer(accessToken),
  });
  return (result.items ?? [])
    .filter((event) => event.status !== "cancelled")
    .map(presentEvent);
}

export async function createEvent(accessToken: string, draft: EventDraft) {
  if (!draft.summary.trim() || draft.summary.length > 500)
    throw new ConnectorError(
      "Calendar",
      "Enter an event name up to 500 characters.",
    );
  const { timeMin, timeMax } = calendarRange(draft.start, draft.end);
  const url = new URL(calendar);
  url.search = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: "250",
    singleEvents: "true",
    fields: "items(id,status,transparency),nextPageToken",
  }).toString();
  const conflicts = await requestJson<{
    items?: GoogleEvent[];
    nextPageToken?: string;
  }>("Calendar", url, { headers: bearer(accessToken) });
  if (
    conflicts.items?.some(
      (event) =>
        event.status !== "cancelled" && event.transparency !== "transparent",
    )
  ) {
    throw new ConnectorError(
      "Calendar",
      "This time overlaps a busy event. Choose a new time.",
      409,
    );
  }
  if (conflicts.nextPageToken)
    throw new ConnectorError(
      "Calendar",
      "This window contains too many events to verify availability. Choose a shorter window.",
      409,
    );
  const result = await requestJson<GoogleEvent>(
    "Calendar",
    calendar + "?sendUpdates=none",
    postJson(bearer(accessToken), {
      summary: draft.summary,
      start: { dateTime: timeMin },
      end: { dateTime: timeMax },
    }),
  );
  if (!result.id)
    throw new ConnectorError(
      "Calendar",
      "Creation status is unknown. Check your calendar before retrying.",
      502,
    );
  return presentEvent(result);
}
