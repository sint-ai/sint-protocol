export type CliConfig = {
  gatewayUrl: string;
  apiKey?: string;
};

export function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value.length > 0) {
      search.set(key, value);
    }
  }
  const encoded = search.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

export async function requestJson(
  config: CliConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = new URL(path, config.gatewayUrl.endsWith("/") ? config.gatewayUrl : `${config.gatewayUrl}/`);
  const headers = new Headers();

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (config.apiKey) {
    headers.set("x-api-key", config.apiKey);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const parsed = text.length > 0 ? tryParseJson(text) : undefined;

  if (!response.ok) {
    const detail = typeof parsed === "object" && parsed !== null ? JSON.stringify(parsed) : text;
    throw new Error(`${method} ${path} failed (${response.status}): ${detail}`);
  }

  return parsed ?? { ok: true };
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
