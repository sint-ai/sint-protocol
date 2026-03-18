/**
 * SINT Protocol — Shared HTTP Client for economy adapters.
 *
 * Provides a fetch wrapper with:
 * - Configurable base URL
 * - Authorization header injection
 * - Retry with exponential backoff
 * - Timeout support
 * - JSON parsing
 *
 * @module @sint/bridge-economy/adapters/http-client
 */

import { ok, err, type Result } from "@sint/core";

/**
 * HTTP client configuration.
 */
export interface HttpClientConfig {
  /** Base URL for the API (e.g. "https://api.sint.ai"). */
  readonly baseUrl: string;
  /** Authorization token (Bearer). */
  readonly authToken?: string;
  /** Request timeout in milliseconds (default: 5000). */
  readonly timeoutMs?: number;
  /** Maximum number of retries (default: 2). */
  readonly maxRetries?: number;
  /** Custom fetch implementation (for testing). */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Shared HTTP client for economy bridge adapters.
 *
 * @example
 * ```ts
 * const client = new HttpClient({
 *   baseUrl: "https://api.sint.ai",
 *   authToken: "Bearer abc123",
 * });
 * const result = await client.get("/balance/user1");
 * ```
 */
export class HttpClient {
  private readonly config: Required<Omit<HttpClientConfig, "authToken" | "fetchImpl">> & {
    authToken?: string;
    fetchImpl: typeof fetch;
  };

  constructor(config: HttpClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      authToken: config.authToken,
      timeoutMs: config.timeoutMs ?? 5000,
      maxRetries: config.maxRetries ?? 2,
      fetchImpl: config.fetchImpl ?? globalThis.fetch.bind(globalThis),
    };
  }

  /**
   * HTTP GET request.
   */
  async get<T>(path: string): Promise<Result<T, Error>> {
    return this.request<T>("GET", path);
  }

  /**
   * HTTP POST request with JSON body.
   */
  async post<T>(path: string, body: unknown): Promise<Result<T, Error>> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Result<T, Error>> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.config.authToken) {
      headers["Authorization"] = `Bearer ${this.config.authToken}`;
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
          const response = await this.config.fetchImpl(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const text = await response.text().catch(() => "");
            lastError = new Error(
              `HTTP ${response.status} ${response.statusText}: ${text}`,
            );

            // Don't retry on 4xx (except 429)
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              return err(lastError);
            }

            // Retry on 5xx and 429
            if (attempt < this.config.maxRetries) {
              await this.backoff(attempt);
              continue;
            }
            return err(lastError);
          }

          const data = (await response.json()) as T;
          return ok(data);
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries) {
          await this.backoff(attempt);
          continue;
        }
      }
    }

    return err(lastError ?? new Error("Request failed after retries"));
  }

  private backoff(attempt: number): Promise<void> {
    const delayMs = Math.min(1000 * Math.pow(2, attempt), 5000);
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
