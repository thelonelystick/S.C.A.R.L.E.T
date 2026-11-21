import {
  discoverModels,
  chatModel,
  ConnectorError,
  type ChatMessage,
  type Provider,
} from "./connectors";
import { entitlements } from "./entitlements";
import { quota, audit } from "./db";
export type Tier = "conversation" | "reasoning" | "coding" | "vision" | "fast";
type Credential = { provider: Provider; model: string; apiKey: string };
export function pickTier(messages: ChatMessage[]): Tier {
  if (messages.some((m) => m.image)) return "vision";
  const text = messages.at(-1)?.content || "";
  if (
    /\b(code|function|typescript|debug|python|programming|refactor)\b/i.test(
      text,
    )
  )
    return "coding";
  if (/\b(reason|analy[sz]e|compare|report|explain why)\b/i.test(text))
    return "reasoning";
  return text.length < 200 ? "fast" : "conversation";
}
export async function routedChat(
  uid: string,
  c: Credential,
  messages: ChatMessage[],
  system: string,
) {
  const tier = pickTier(messages),
    raw = process.env.MODEL_ROUTES_JSON;
  let requested: string | undefined;
  if (raw) {
    try {
      requested = JSON.parse(raw)[c.provider]?.[tier];
    } catch {
      throw new ConnectorError(
        "configuration",
        "Invalid administrator model routing configuration.",
        503,
      );
    }
  }
  const max = (await entitlements(uid)).dailyModelCalls;
  let model = c.model;
  if (
    typeof requested === "string" &&
    requested !== c.model &&
    (await discoverModels(c.provider, c.apiKey)).includes(requested)
  )
    model = requested;
  async function call(name: string) {
    await quota("ai:" + uid, max, 86400);
    return chatModel({ ...c, model: name, system, messages, maxTokens: 1000 });
  }
  try {
    return await call(model);
  } catch (e) {
    if (
      model === c.model ||
      !(e instanceof ConnectorError) ||
      ![404, 429, 503].includes(e.status)
    )
      throw e;
    await audit(uid, "Model fallback selected", "model", c.model);
    return call(c.model);
  }
}
