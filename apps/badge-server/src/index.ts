/**
 * sint.click badge server
 * 
 * GET /badge/project/:id.svg
 *   ?status=verified|pending|failed
 *   ?label=SINT+Verified  (override label)
 * 
 * Returns a shields.io-compatible flat badge SVG.
 * No auth. Stateless. Cache-friendly.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("*", cors());

// ---------------------------------------------------------------------------
// Badge registry — track projects that have requested badges
// In production, this would be persisted. Here we use an in-memory map
// seeded with known cross-verified projects.
// ---------------------------------------------------------------------------

interface BadgeRecord {
  projectId: string;
  projectName: string;
  status: "verified" | "pending" | "failed";
  verifiedAt?: string;
  testCount?: number;
  codeChanges?: number;  // 0 = strongest convergence signal
  claimedAt: string;
}

const registry = new Map<string, BadgeRecord>([
  ["sint-protocol", {
    projectId: "sint-protocol",
    projectName: "SINT Protocol",
    status: "verified",
    verifiedAt: "2026-04-04T06:45:00Z",
    testCount: 9,
    codeChanges: 0,
    claimedAt: "2026-04-04T06:45:00Z",
  }],
  ["agent-passport-system", {
    projectId: "agent-passport-system",
    projectName: "Agent Passport System",
    status: "verified",
    verifiedAt: "2026-04-04T06:27:00Z",
    testCount: 9,
    codeChanges: 0,
    claimedAt: "2026-04-04T06:27:00Z",
  }],
  ["motebit", {
    projectId: "motebit",
    projectName: "motebit",
    status: "verified",
    verifiedAt: "2026-04-11T12:52:31Z",
    testCount: 9,
    codeChanges: 0,
    claimedAt: "2026-04-11T12:52:31Z",
  }],
]);

// ---------------------------------------------------------------------------
// SVG badge generator
// ---------------------------------------------------------------------------

type BadgeStatus = "verified" | "pending" | "failed" | "unknown";

const COLORS: Record<BadgeStatus, string> = {
  verified: "#2ea44f",   // GitHub green
  pending:  "#e36209",   // amber
  failed:   "#cb2431",   // red
  unknown:  "#6e7681",   // grey
};

const ICONS: Record<BadgeStatus, string> = {
  verified: "✓",
  pending:  "⏳",
  failed:   "✗",
  unknown:  "?",
};

function makeBadge(opts: {
  label: string;
  value: string;
  color: string;
  labelColor?: string;
}): string {
  const { label, value, color, labelColor = "#555" } = opts;

  // Approximate text widths (monospace estimation)
  const charWidth = 6.5;
  const padding = 10;
  const labelW = Math.ceil(label.length * charWidth + padding * 2);
  const valueW = Math.ceil(value.length * charWidth + padding * 2);
  const totalW = labelW + valueW;
  const h = 20;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${h}" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalW}" height="${h}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="${h}" fill="${labelColor}"/>
    <rect x="${labelW}" width="${valueW}" height="${h}" fill="${color}"/>
    <rect width="${totalW}" height="${h}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelW / 2 + 1}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelW / 2}" y="14">${label}</text>
    <text x="${labelW + valueW / 2 + 1}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelW + valueW / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /badge/project/:id.svg
app.get("/badge/project/:filename", (c) => {
  const filename = c.req.param("filename");
  const projectId = filename.replace(/\.svg$/, "");
  
  const labelOverride = c.req.query("label");
  const statusOverride = c.req.query("status") as BadgeStatus | undefined;

  const record = registry.get(projectId);
  const status: BadgeStatus = statusOverride ?? (record?.status as BadgeStatus) ?? "unknown";
  const label = labelOverride ?? "SINT";
  const value = status === "verified"
    ? `verified ${record?.testCount ? `${record.testCount}/9` : ""} ${ICONS.verified}`.trim()
    : `${status} ${ICONS[status]}`.trim();

  const svg = makeBadge({
    label,
    value,
    color: COLORS[status],
  });

  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "max-age=300, s-maxage=300");
  c.header("X-SINT-Project", projectId);
  c.header("X-SINT-Status", status);

  return c.body(svg, 200);
});

// POST /badge/claim  — register a project for a badge
app.post("/badge/claim", async (c) => {
  const body = await c.req.json<{
    projectId: string;
    projectName: string;
    testCount?: number;
    commitHash?: string;
    repoUrl?: string;
  }>();

  if (!body.projectId || !body.projectName) {
    return c.json({ error: "projectId and projectName required" }, 400);
  }

  const record: BadgeRecord = {
    projectId: body.projectId,
    projectName: body.projectName,
    status: "pending",
    testCount: body.testCount,
    codeChanges: 0,
    claimedAt: new Date().toISOString(),
  };

  registry.set(body.projectId, record);
  return c.json({ 
    projectId: body.projectId, 
    badgeUrl: `/badge/project/${body.projectId}.svg`,
    markdownBadge: `[![SINT Verified](https://sint.click/badge/project/${body.projectId}.svg)](https://github.com/sint-ai/sint-protocol)`,
    status: "pending",
    message: "Badge claimed. Status will update to 'verified' after cross-verification tests pass."
  }, 201);
});

// GET /badge/registry — list all claimed badges
app.get("/badge/registry", (c) => {
  const entries = Array.from(registry.values()).map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    status: r.status,
    verifiedAt: r.verifiedAt,
    testCount: r.testCount,
    badgeUrl: `https://sint.click/badge/project/${r.projectId}.svg`,
  }));
  return c.json({ count: entries.length, projects: entries });
});

// GET /health
app.get("/health", (c) => c.json({ status: "ok", registrySize: registry.size }));

export default app;
