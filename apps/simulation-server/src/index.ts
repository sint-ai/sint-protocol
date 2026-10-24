import { serve } from "@hono/node-server";
import { loadSimulationWorkerConfig } from "./config.js";
import { createConfiguredSimulationRuntime } from "./runtime.js";
import { createSimulationWorkerApp } from "./server.js";

async function main(): Promise<void> {
  const config = loadSimulationWorkerConfig();
  const { simulator } = createConfiguredSimulationRuntime(config);
  const app = createSimulationWorkerApp({
    simulator,
    bearerToken: config.bearerToken,
    maxBodyBytes: config.maxBodyBytes,
  });
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[SINT] predictive safety worker listening on http://localhost:${info.port}`);
    console.log(`[SINT] signer public key: ${config.signerPublicKey}`);
    if (config.ephemeralSigner) {
      console.warn("[SINT] using an ephemeral development signer; receipts will not survive trust restarts");
    }
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[SINT] received ${signal}; stopping predictive safety worker`);
    server.close((error) => {
      if (error) {
        console.error("[SINT] simulation worker shutdown failed", error);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error("[SINT] simulation worker startup failed", error);
  process.exitCode = 1;
});
