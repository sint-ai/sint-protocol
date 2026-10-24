import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { applyMiddleware } from "../src/middleware.js";

describe("production browser origin policy", () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; });

  it("rejects unlisted browser origins and permits an explicit origin", async () => {
    process.env.SINT_ENV = "production";
    process.env.SINT_ALLOWED_ORIGINS = "https://console.example.test";
    const app = new Hono();
    applyMiddleware(app);
    app.get("/test", c => c.text("ok"));
    const blocked = await app.request("/test", { headers: { Origin: "https://evil.example.test" } });
    expect(blocked.status).toBe(403);
    const allowed = await app.request("/test", { headers: { Origin: "https://console.example.test" } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://console.example.test");
  });
});
