/**
 * SINT Gateway Server — Prometheus-Compatible Metrics.
 *
 * In-process counters, gauges, and histograms exposed
 * via GET /v1/metrics in Prometheus text format.
 *
 * @module @pshkv/gateway-server/middleware/metrics
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";

/** Simple counter metric. */
class Counter {
  private values = new Map<string, number>();

  inc(labels: Record<string, string> = {}): void {
    const key = this.labelsKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + 1);
  }

  format(name: string, help: string): string {
    const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
    for (const [key, value] of this.values) {
      lines.push(`${name}${key} ${value}`);
    }
    return lines.join("\n");
  }

  private labelsKey(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return "";
    return "{" + entries.map(([k, v]) => `${k}="${v}"`).join(",") + "}";
  }
}

/** Simple gauge metric. */
class Gauge {
  private value = 0;

  set(v: number): void {
    this.value = v;
  }

  inc(): void {
    this.value++;
  }

  dec(): void {
    this.value--;
  }

  format(name: string, help: string): string {
    return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${this.value}`;
  }
}

/** Simple histogram metric with fixed buckets. */
class Histogram {
  private readonly buckets: number[];
  private counts: number[] = [];
  private sum = 0;
  private count = 0;

  constructor(buckets: number[] = [10, 50, 100, 250, 500, 1000, 5000, 10000]) {
    this.buckets = buckets.sort((a, b) => a - b);
    this.counts = new Array(this.buckets.length + 1).fill(0);
  }

  observe(value: number): void {
    this.sum += value;
    this.count++;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]!) {
        this.counts[i]!++;
        return;
      }
    }
    this.counts[this.buckets.length]!++;
  }

  format(name: string, help: string): string {
    const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
    let cumulative = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      cumulative += this.counts[i]!;
      lines.push(`${name}_bucket{le="${this.buckets[i]}"} ${cumulative}`);
    }
    cumulative += this.counts[this.buckets.length]!;
    lines.push(`${name}_bucket{le="+Inf"} ${cumulative}`);
    lines.push(`${name}_sum ${this.sum}`);
    lines.push(`${name}_count ${this.count}`);
    return lines.join("\n");
  }
}

/** Metrics registry. */
export const metrics = {
  requestsTotal: new Counter(),
  approvalQueueSize: new Gauge(),
  approvalResolutionMs: new Histogram(),
  tokenOperationsTotal: new Counter(),
};

/** Middleware that tracks request metrics. */
export function metricsMiddleware() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    await next();

    const path = new URL(c.req.url).pathname;
    const method = c.req.method;
    const status = String(c.res.status);

    metrics.requestsTotal.inc({ method, path, status });

    // Track approval resolution latency
    if (path.includes("/approvals/") && path.includes("/resolve")) {
      metrics.approvalResolutionMs.observe(Date.now() - start);
    }

    // Track token operations
    if (path.startsWith("/v1/tokens")) {
      const op = path.includes("revoke") ? "revoke" : path.includes("delegate") ? "delegate" : "issue";
      metrics.tokenOperationsTotal.inc({ operation: op });
    }
  };
}

/** Prometheus-compatible metrics endpoint. */
export function metricsRoutes(): Hono {
  const app = new Hono();

  app.get("/v1/metrics", (c) => {
    const body = [
      metrics.requestsTotal.format("sint_requests_total", "Total HTTP requests"),
      metrics.approvalQueueSize.format("sint_approval_queue_size", "Current approval queue size"),
      metrics.approvalResolutionMs.format(
        "sint_approval_resolution_ms",
        "Approval resolution latency in milliseconds",
      ),
      metrics.tokenOperationsTotal.format(
        "sint_token_operations_total",
        "Total token operations",
      ),
    ].join("\n\n");

    return c.text(body, 200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    });
  });

  return app;
}
