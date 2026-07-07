#!/usr/bin/env node
// sint-scan v0.1.0 — SINT Labs
// Scan any MCP server for risky tools in seconds
// https://sint.gg | Apache-2.0

'use strict';

const { scanTools, formatReport } = require('./scanner.js');

const RESET = '\x1b[0m', BOLD = '\x1b[1m';
const RED = '\x1b[31m', YELLOW = '\x1b[33m', GREEN = '\x1b[32m', CYAN = '\x1b[36m', DIM = '\x1b[2m';

function printUsage() {
  console.log(`\n${BOLD}sint-scan${RESET} — MCP Server Security Scanner by SINT Protocol\n`);
  console.log(`  ${BOLD}Usage:${RESET}`);
  console.log(`    npx sint-scan --tools '[{"name":"bash","description":"runs commands"}]'`);
  console.log(`    echo '[{"name":"readFile"}]' | npx sint-scan --server myserver\n`);
  console.log(`  ${BOLD}Options:${RESET}`);
  console.log(`    --server <id>    Server identifier (default: "unknown")`);
  console.log(`    --tools <json>   JSON array of MCP tool definitions`);
  console.log(`    --json           Output raw JSON report`);
  console.log(`    --help           Show this help\n`);
  console.log(`  ${DIM}Full governance: https://sint.gg${RESET}\n`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage(); process.exit(0);
  }

  const jsonMode = args.includes('--json');
  const serverIdx = args.indexOf('--server');
  const toolsIdx = args.indexOf('--tools');
  const serverId = serverIdx !== -1 ? args[serverIdx + 1] : 'unknown';

  let toolsJson = null;
  if (toolsIdx !== -1) {
    toolsJson = args[toolsIdx + 1];
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    toolsJson = Buffer.concat(chunks).toString().trim();
  }

  if (!toolsJson) {
    console.error(`${RED}Error:${RESET} No tools provided. Use --tools or pipe JSON.\n`);
    printUsage(); process.exit(1);
  }

  let tools;
  try {
    tools = JSON.parse(toolsJson);
    if (!Array.isArray(tools)) tools = [tools];
  } catch (e) {
    console.error(`${RED}Error:${RESET} Invalid JSON: ${e.message}`); process.exit(1);
  }

  const report = scanTools(tools, serverId);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2)); return;
  }

  formatReport(report);
  process.exit(report.overallRisk === 'CRITICAL' ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
