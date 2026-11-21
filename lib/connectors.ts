// Node-only entry point. Application routes supply tenant-scoped credentials and approved arguments.
export { discoverModels, chatModel } from "./providers/models";
export type {
  Provider,
  InputImage,
  ChatMessage,
  ModelRequest,
  ModelReply,
} from "./providers/models";
export * from "./providers/planning";
export * from "./providers/google-workspace";
export * from "./providers/whatsapp";
export { ConnectorError } from "./providers/http";
import { ConnectorError, requestJson } from "./providers/http";

export type SearchHit = { title: string; url: string; description: string };
export async function searchWeb(
  query: string,
  apiKey: string,
): Promise<SearchHit[]> {
  if (!apiKey?.trim())
    throw new ConnectorError(
      "Brave Search",
      "Connect a Brave Search API key.",
      503,
    );
  const q = query.trim();
  if (!q || q.length > 400)
    throw new ConnectorError(
      "Brave Search",
      "Enter a search query up to 400 characters.",
    );
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.search = new URLSearchParams({
    q,
    count: "5",
    text_decorations: "false",
    safesearch: "moderate",
  }).toString();
  const result = await requestJson<{ web?: { results?: SearchHit[] } }>(
    "Brave Search",
    url,
    { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } },
  );
  return (result.web?.results ?? []).slice(0, 5).flatMap((result) => {
    try {
      const source = new URL(result.url);
      if (
        !["http:", "https:"].includes(source.protocol) ||
        source.username ||
        source.password
      )
        return [];
      return [
        {
          title: String(result.title ?? "").slice(0, 256),
          url: source.href,
          description: String(result.description ?? "").slice(0, 1600),
        },
      ];
    } catch {
      return [];
    }
  });
}
