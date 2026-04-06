#!/usr/bin/env node
/**
 * SINT MCP Security Scanner — CLI entry point.
 *
 * Usage:
 *   echo '[{"name":"readFile","description":"reads a file"}]' | sint-scan --server filesystem
 *   sint-scan --server myserver --tools '[{"name":"bash","description":"runs shell commands"}]'
 */

import { scanServer } from "./scanner.js";
import type { ServerScanReport } from "./scanner.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

function riskColor(risk: string): string {
  switch (risk) {
    case "CRITICAL": return `${BOLD}${RED}`;
    case "HIGH": return `${BOLD}${YELLOW}`;
    case "MEDIUM": return CYAN;
    case "LOW": return GREEN;
    default: return RESET;
  }
}

function printReport(report: ServerScanReport): void {
  console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD} SINT MCP Security Scanner Report${RESET}`);
  console.log(`${BOLD}${CYAN}══════════════════════════════════════════════${RESET}`);
  console.log(`  Server:      ${BOLD}${report.serverId}${RESET}`);
  console.log(`  Scanned at:  ${report.scannedAt}`);
  console.log(`  Total tools: ${report.totalTools}`);
  console.log(`  Overall risk: ${riskColor(report.overallRisk)}${BOLD}${report.overallRisk}${RESET}`);
  console.log();

  console.log(`${BOLD}Risk Summary:${RESET}`);
  console.log(`  ${riskColor("CRITICAL")}CRITICAL${RESET}: ${report.byRisk.CRITICAL}`);
  console.log(`  ${riskColor("HIGH")}HIGH${RESET}:     ${report.byRisk.HIGH}`);
  console.log(`  ${riskColor("MEDIUM")}MEDIUM${RESET}:   ${report.byRisk.MEDIUM}`);
  console.log(`  ${riskColor("LOW")}LOW${RESET}:      ${report.byRisk.LOW}`);
  console.log();

  if (report.criticalTools.length > 0 || report.highTools.length > 0) {
    console.log(`${BOLD}${RED}High-Risk Tools:${RESET}`);
    const flagged = [...report.criticalTools, ...report.highTools];
    for (const tool of flagged) {
      console.log(`  ${riskColor(tool.riskLevel)}[${tool.riskLevel}]${RESET} ${BOLD}${tool.toolName}${RESET}`);
      for (const reason of tool.reasons) {
        console.log(`       • ${reason}`);
      }
    }
    console.log();
  }

  console.log(`${BOLD}All Tools:${RESET}`);
  for (const tool of report.allTools) {
    const approval = tool.requiresHumanApproval ? `${MAGENTA}[HUMAN APPROVAL]${RESET}` : "";
    console.log(
      `  ${riskColor(tool.riskLevel)}[${tool.riskLevel.padEnd(8)}]${RESET} ${tool.toolName} ${approval}`,
    );
  }
  console.log();

  if (report.recommendations.length > 0) {
    console.log(`${BOLD}${YELLOW}Recommendations:${RESET}`);
    for (const rec of report.recommendations) {
      console.log(`  → ${rec}`);
    }
    console.log();
  }

  if (report.byRisk.HIGH > 0 || report.byRisk.CRITICAL > 0) {
    console.log(`${BOLD}${MAGENTA}One-Click SINT Proxy Scaffold:${RESET}`);
    console.log(`  npx @pshkv/mcp-scanner --server ${report.serverId} --emit-claude-config`);
    console.log();
  }

  console.log(`${BOLD}${CYAN}══════════════════════════════════════════════${RESET}\n`);
}

function printClaudeConfigSnippet(serverId: string): void {
  const proxyId = `sint-${serverId}`;
  const snippet = {
    mcpServers: {
      [proxyId]: {
        command: "node",
        args: ["/absolute/path/to/sint-protocol/apps/sint-mcp/dist/index.js"],
        env: {
          SINT_UPSTREAM_COMMAND: "npx",
          SINT_UPSTREAM_ARGS: `-y @modelcontextprotocol/server-${serverId}`,
          SINT_MAX_TIER: "T2_ACT",
          SINT_REQUIRE_APPROVAL_TIER: "T3_COMMIT",
        },
      },
    },
  };
  console.log(JSON.stringify(snippet, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let serverId = "unknown-server";
  let toolsJson: string | null = null;
  let emitClaudeConfig = false;
  let checkRegistry = false;
  let registryUrl = "https://registry.sint.gg/v1";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--server" && args[i + 1]) {
      serverId = args[i + 1] ?? serverId;
      i++;
    } else if (args[i] === "--tools" && args[i + 1]) {
      toolsJson = args[i + 1] ?? null;
      i++;
    } else if (args[i] === "--emit-claude-config") {
      emitClaudeConfig = true;
    } else if (args[i] === "--check-registry") {
      checkRegistry = true;
    } else if (args[i] === "--registry-url" && args[i + 1]) {
      registryUrl = args[i + 1] ?? registryUrl;
      i++;
    }
  }

  if (emitClaudeConfig) {
    printClaudeConfigSnippet(serverId);
    return;
  }

  // Read tools from --tools flag or stdin
  if (!toolsJson) {
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      toolsJson = Buffer.concat(chunks).toString("utf-8").trim();
    }
  }

  if (!toolsJson) {
    console.error("Error: Provide tools via --tools or stdin (JSON array).");
    console.error(
      'Usage: echo \'[{"name":"readFile","description":"reads a file"}]\' | sint-scan --server filesystem',
    );
    process.exit(1);
  }

  let tools: Array<{ name: string; description: string }>;
  try {
    tools = JSON.parse(toolsJson) as Array<{ name: string; description: string }>;
  } catch {
    console.error("Error: Invalid JSON for tools input.");
    process.exit(1);
  }

  const report = scanServer(serverId, tools);
  printReport(report);

  if (checkRegistry) {
    console.log("\n📋 Registry check:");
    for (const tool of report.allTools) {
      const toolScope = `mcp://${serverId}/${tool.toolName}`;
      try {
        const resp = await fetch(`${registryUrl}/registry/tokens?toolScope=${encodeURIComponent(toolScope)}`);
        const data = await resp.json() as { entries: unknown[] };
        const signed = data.entries.length > 0;
        console.log(`  ${signed ? "✓" : "✗"} ${tool.toolName} — ${signed ? "registered" : "not in registry"}`);
      } catch {
        console.log(`  ? ${tool.toolName} — registry check failed`);
      }
    }
  }

  // Exit with non-zero if CRITICAL tools found
  if (report.byRisk.CRITICAL > 0) {
    process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
