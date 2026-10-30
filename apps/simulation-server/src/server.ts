import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual } from "node:crypto";
import {
  effectSimulationRequestSchema,
  type EffectSimulator,
} from "@pshkv/core";

export interface SimulationWorkerAppOptions {
  readonly simulator: EffectSimulator;
  readonly bearerToken?: string;
  readonly maxBodyBytes?: number;
}

function statusForError(error: { readonly code: string; readonly retryable: boolean }): 409 | 422 | 503 {
  if (error.retryable) return 503;
  return error.code === "UNSUPPORTED_EVIDENCE_GRADE" ? 409 : 422;
}

function bearerMatches(header: string | undefined, expectedToken: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const observed = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return observed.length === expected.length && timingSafeEqual(observed, expected);
}

/** Create an isolated worker app; this surface issues evidence and never authorization. */
export function createSimulationWorkerApp(options: SimulationWorkerAppOptions): Hono {
  const app = new Hono();

  app.use("/v1/simulate", bodyLimit({
    maxSize: options.maxBodyBytes ?? 1_048_576,
    onError: (context) => context.json({ error: "simulation request body too large" }, 413),
  }));

  app.get("/v1/health", (context) => context.json({
    status: "ok",
    protocol: "sint-effect-simulator/1",
    authorizesExecution: false,
    backend: options.simulator.backend,
    supportedGrades: options.simulator.supportedGrades,
  }));

  app.post("/v1/simulate", async (context) => {
    if (
      options.bearerToken !== undefined
      && !bearerMatches(context.req.header("Authorization"), options.bearerToken)
    ) {
      return context.json({ error: "unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: "request body must be JSON" }, 400);
    }
    const parsed = effectSimulationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: "invalid simulation request", issues: parsed.error.issues }, 400);
    }

    const simulated = await options.simulator.simulate(parsed.data.preflight, parsed.data.worldSnapshot);
    if (!simulated.ok) {
      return context.json({ error: simulated.error }, statusForError(simulated.error));
    }
    return context.json({ receipt: simulated.value }, 200);
  });

  return app;
}
