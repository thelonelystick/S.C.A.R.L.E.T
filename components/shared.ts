export async function api(path: string, payload?: unknown) {
  const options: RequestInit =
    payload === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        };
  let r: Response;
  try {
    r = await fetch("/api/" + path, options);
  } catch {
    throw new Error(
      "Connection interrupted. Check your network and try again.",
    );
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Object.assign(
      new Error(data.error || "The service could not complete this request."),
      { status: r.status },
    );
  return data;
}
export const moment = (v: string) =>
  new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const stamp = (v: string) =>
  new Date(v).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
