import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  bearer,
  ConnectorError,
  postJson,
  requestJson,
  requiredEnv,
} from "./http";

export function verifyWhatsAppSignature(
  raw: Uint8Array | string,
  signature: string | null,
  appSecret: string,
) {
  if (!appSecret || !signature || !/^sha256=[a-f0-9]{64}$/u.test(signature))
    return false;
  const expected = createHmac("sha256", appSecret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

export function verifyWhatsAppChallenge(
  params: URLSearchParams,
  verifyToken: string,
): string | null {
  const provided = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge") ?? "";
  if (
    !verifyToken ||
    params.get("hub.mode") !== "subscribe" ||
    !challenge ||
    challenge.length > 512
  )
    return null;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(verifyToken), digest(provided))
    ? challenge
    : null;
}

export type InboundWhatsApp = {
  id: string;
  phoneId: string;
  from: string;
  text: string;
  timestamp: number;
  optedOut: boolean;
  requestedHandoff: boolean;
};

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readWhatsAppInbound(payload: unknown): InboundWhatsApp[] {
  const envelope = objectOf(payload);
  if (envelope.object !== "whatsapp_business_account") return [];
  const messages: InboundWhatsApp[] = [];
  for (const entry of listOf(envelope.entry)) {
    for (const change of listOf(objectOf(entry).changes)) {
      if (objectOf(change).field !== "messages") continue;
      const value = objectOf(objectOf(change).value);
      const phoneId = objectOf(value.metadata).phone_number_id;
      if (typeof phoneId !== "string" || !/^\d{1,32}$/u.test(phoneId)) continue;
      for (const raw of listOf(value.messages)) {
        const msg = objectOf(raw);
        const text = objectOf(msg.text).body;
        const timestamp = Number(msg.timestamp) * 1000;
        if (
          msg.type !== "text" ||
          typeof msg.id !== "string" ||
          !msg.id ||
          msg.id.length > 512 ||
          typeof msg.from !== "string" ||
          !/^\d{6,15}$/u.test(msg.from)
        )
          continue;
        if (
          typeof text !== "string" ||
          !Number.isSafeInteger(timestamp) ||
          timestamp <= 0 ||
          timestamp > Date.now() + 60_000
        )
          continue;
        messages.push({
          id: msg.id,
          phoneId,
          from: msg.from,
          text: text.slice(0, 4096),
          timestamp,
          optedOut:
            /^(?:stop|unsubscribe|opt[ -]?out|cancel|end|quit)[.!]?$/iu.test(
              text.trim(),
            ),
          requestedHandoff:
            /^(?:agent|human|representative|speak to a human)[.!]?$/iu.test(
              text.trim(),
            ),
        });
      }
    }
  }
  return messages;
}

function phoneUrl(phoneId: string) {
  if (!/^\d{1,32}$/u.test(phoneId))
    throw new ConnectorError(
      "WhatsApp",
      "Enter a valid WhatsApp Business phone number ID.",
    );
  const version = requiredEnv("META_GRAPH_VERSION");
  if (!/^v\d+\.\d+$/u.test(version))
    throw new ConnectorError(
      "WhatsApp",
      "Set a supported Graph API version such as v27.0.",
    );
  return "https://graph.facebook.com/" + version + "/" + phoneId;
}

// Before assigning an inbound phone ID to a tenant, verify the user's access at Meta.
export async function verifyWhatsAppPhone(token: string, phoneId: string) {
  const data = await requestJson<{
    id: string;
    verified_name?: string;
    display_phone_number?: string;
  }>(
    "WhatsApp",
    phoneUrl(phoneId) + "?fields=id,verified_name,display_phone_number",
    { headers: bearer(token) },
  );
  if (data.id !== phoneId)
    throw new ConnectorError(
      "WhatsApp",
      "This credential does not authorize the requested phone.",
    );
  return {
    id: data.id,
    name: data.verified_name ?? "",
    number: data.display_phone_number ?? "",
  };
}

async function sendMeta(
  token: string,
  phoneId: string,
  recipient: string,
  content: Record<string, unknown>,
) {
  const to = recipient.replace(/^\+/u, "");
  if (!/^[1-9]\d{5,14}$/u.test(to))
    throw new ConnectorError(
      "WhatsApp",
      "Use the international recipient number with country code.",
    );
  const data = await requestJson<{ messages?: { id: string }[] }>(
    "WhatsApp",
    phoneUrl(phoneId) + "/messages",
    postJson(bearer(token), {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...content,
    }),
  );
  const id = data.messages?.[0]?.id;
  if (!id)
    throw new ConnectorError(
      "WhatsApp",
      "Delivery status is unknown. Review the provider log before retrying.",
      502,
    );
  return { id };
}

export function hasWhatsAppWindow(
  lastInboundAt: number | string | Date,
  now = Date.now(),
) {
  const millis =
    typeof lastInboundAt === "number"
      ? lastInboundAt
      : new Date(lastInboundAt).getTime();
  return (
    Number.isFinite(millis) && millis <= now && now - millis < 24 * 3_600_000
  );
}

export async function sendWhatsApp(input: {
  token: string;
  phoneId: string;
  to: string;
  text: string;
  lastInboundAt: number | string | Date;
}) {
  if (!hasWhatsAppWindow(input.lastInboundAt))
    throw new ConnectorError(
      "WhatsApp",
      "The customer service window is closed. Use an approved template for an opted-in contact.",
    );
  if (!input.text.trim() || input.text.length > 4096)
    throw new ConnectorError(
      "WhatsApp",
      "Enter a message up to 4096 characters.",
    );
  return sendMeta(input.token, input.phoneId, input.to, {
    type: "text",
    text: { body: input.text, preview_url: false },
  });
}

// Supports Meta-approved templates with a language and optional positional text body parameters.
export async function sendWhatsAppTemplate(input: {
  token: string;
  phoneId: string;
  to: string;
  name: string;
  language: string;
  parameters?: string[];
  optedIn: boolean;
}) {
  if (!input.optedIn)
    throw new ConnectorError(
      "WhatsApp",
      "The recipient must have a recorded opt-in before sending a template.",
    );
  if (
    !/^[a-z0-9_]{1,128}$/u.test(input.name) ||
    !/^[a-z]{2,3}(?:_[A-Z]{2})?$/u.test(input.language)
  )
    throw new ConnectorError(
      "WhatsApp",
      "Use the approved template name and locale.",
    );
  const values = input.parameters ?? [];
  if (values.length > 20 || values.some((v) => !v.trim() || v.length > 1024))
    throw new ConnectorError("WhatsApp", "Check the template text parameters.");
  const components = values.length
    ? [
        {
          type: "body",
          parameters: values.map((text) => ({ type: "text", text })),
        },
      ]
    : [];
  return sendMeta(input.token, input.phoneId, input.to, {
    type: "template",
    template: {
      name: input.name,
      language: { code: input.language },
      components,
    },
  });
}

export type AutoReplyPolicy = {
  mode: "manual" | "assisted" | "auto";
  paused: boolean;
  allowlist: string[];
  excluded: string[];
  timezone: string;
  days: number[];
  startHour: number;
  endHour: number;
  maxPerHour: number;
};
export type AutoReplyContext = {
  from: string;
  lastInboundAt: number;
  optedOut: boolean;
  handoff: boolean;
  sentLastHour: number;
};
export function canAutoReply(
  policy: AutoReplyPolicy,
  context: AutoReplyContext,
  now = Date.now(),
): { allowed: boolean; reason: string } {
  const deny = (reason: string) => ({ allowed: false, reason });
  if (policy.mode !== "auto" || policy.paused !== false)
    return deny("Automatic replies are paused or disabled.");
  if (context.optedOut !== false || context.handoff !== false)
    return deny("Contact opted out or requested a human.");
  if (!hasWhatsAppWindow(context.lastInboundAt, now))
    return deny("Customer service window is closed.");
  const normalize = (n: string) => n.replace(/^\+/u, "");
  if (
    !/^[1-9]\d{5,14}$/u.test(normalize(context.from)) ||
    !Array.isArray(policy.excluded) ||
    !Array.isArray(policy.allowlist)
  )
    return deny("Contact permissions are incomplete.");
  const number = normalize(context.from);
  if (
    policy.excluded.some(
      (n) => typeof n === "string" && normalize(n) === number,
    ) ||
    !policy.allowlist.some(
      (n) => typeof n === "string" && normalize(n) === number,
    )
  )
    return deny("Contact is outside the permitted audience.");
  if (
    !Number.isInteger(policy.maxPerHour) ||
    policy.maxPerHour < 1 ||
    policy.maxPerHour > 60 ||
    !Number.isInteger(context.sentLastHour) ||
    context.sentLastHour < 0 ||
    context.sentLastHour >= policy.maxPerHour
  )
    return deny("Hourly auto-reply budget reached or unavailable.");
  if (
    !Array.isArray(policy.days) ||
    !policy.days.length ||
    !policy.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    !Number.isInteger(policy.startHour) ||
    policy.startHour < 0 ||
    policy.startHour > 23 ||
    !Number.isInteger(policy.endHour) ||
    policy.endHour < 0 ||
    policy.endHour > 24 ||
    policy.startHour === policy.endHour ||
    !policy.timezone
  )
    return deny("Business hours are incomplete.");
  try {
    const clock = new Intl.DateTimeFormat("en-US", {
      timeZone: policy.timezone,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(clock.find((part) => part.type === "hour")?.value);
    let day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      clock.find((part) => part.type === "weekday")?.value ?? "",
    );
    const overnight = policy.startHour > policy.endHour;
    const inHours = overnight
      ? hour >= policy.startHour || hour < policy.endHour
      : hour >= policy.startHour && hour < policy.endHour;
    if (overnight && hour < policy.endHour) day = (day + 6) % 7;
    if (!inHours || !policy.days.includes(day))
      return deny("Outside business hours.");
  } catch {
    return deny("Business timezone is invalid.");
  }
  return { allowed: true, reason: "Eligible under the current policy." };
}
