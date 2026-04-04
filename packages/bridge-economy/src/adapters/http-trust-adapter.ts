/**
 * SINT Protocol — HTTP Trust Adapter.
 *
 * Implements ITrustPort by calling the product API's trust endpoints:
 * - POST /trust/evaluate → evaluateTrust
 *
 * @module @sint/bridge-economy/adapters/http-trust-adapter
 */

import { err, type Result } from "@sint/core";
import type { ITrustPort, TrustEvalParams, TrustEvalResult } from "../interfaces.js";
import { HttpClient, type HttpClientConfig } from "./http-client.js";

/**
 * HTTP adapter for the product API's TrustService.
 *
 * @example
 * ```ts
 * const adapter = new HttpTrustAdapter({
 *   baseUrl: "https://api.sint.gg",
 *   authToken: keycloakToken,
 * });
 * const result = await adapter.evaluateTrust({ userId: "u1", agentId: "a1", ... });
 * ```
 */
export class HttpTrustAdapter implements ITrustPort {
  private readonly client: HttpClient;

  constructor(config: HttpClientConfig) {
    this.client = new HttpClient(config);
  }

  async evaluateTrust(params: TrustEvalParams): Promise<Result<TrustEvalResult, Error>> {
    const result = await this.client.post<TrustEvalResult>(
      "/trust/evaluate",
      {
        userId: params.userId,
        agentId: params.agentId,
        action: params.action,
        resource: params.resource,
      },
    );

    if (!result.ok) {
      return err(new Error(`Failed to evaluate trust: ${result.error.message}`));
    }

    return result;
  }
}
