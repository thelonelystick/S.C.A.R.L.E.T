// Server-side transport. Never return an upstream body or a credential-bearing URL in an error.
export class ConnectorError extends Error {
  readonly status: number;
  readonly service: string;

  constructor(service: string, message: string, status = 400) {
    super(message);
    this.name = "ConnectorError";
    this.status = status;
    this.service = service;
  }
}

export function providerFailure(
  service: string,
  status: number,
): ConnectorError {
  let guidance = "The service could not complete this request.";
  if (status === 401 || status === 403)
    guidance = "Check the connection credentials and granted permissions.";
  if (status === 404)
    guidance = "The selected model or resource is unavailable.";
  if (status === 429)
    guidance = "The provider quota or rate limit was reached.";
  if (status === 400)
    guidance =
      "The provider rejected the request. Check the selected model and input.";
  return new ConnectorError(service, service + ": " + guidance, status);
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new ConnectorError(
      "configuration",
      "Set the server environment variable " + name + ".",
      503,
    );
  return value;
}

export function bearer(token: string) {
  if (!token || /[\r\n]/.test(token))
    throw new ConnectorError(
      "credentials",
      "A valid access token is required.",
    );
  return { Authorization: "Bearer " + token };
}

// A single attempt is important for sends and billable generation. The caller owns idempotency.
export async function requestJson<T>(
  service: string,
  url: string | URL,
  init: RequestInit = {},
  maxBytes = 2_000_000,
  emptyOK = false,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw providerFailure(service, response.status);
    }
    const reader = response.body?.getReader();
    if (!reader) {
      if (emptyOK) return undefined as T;
      throw new ConnectorError(
        service,
        "The service returned an empty response.",
        502,
      );
    }
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ConnectorError(
          service,
          "The service response exceeded the size limit.",
          502,
        );
      }
      parts.push(value);
    }
    if (!total && emptyOK) return undefined as T;
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as T;
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    const reason = controller.signal.aborted
      ? "The service timed out."
      : "The service connection or response failed.";
    throw new ConnectorError(service, service + ": " + reason, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function postJson(
  headers: Record<string, string>,
  data: unknown,
): RequestInit {
  return {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
