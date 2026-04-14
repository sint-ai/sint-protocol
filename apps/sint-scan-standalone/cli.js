#!/usr/bin/env node
// sint-scan v0.1.0 — SINT Labs | Apache-2.0
// Scan any MCP server for risky tools in seconds
// https://sint.gg | github.com/sint-ai/sint-protocol

'use strict';

const { scanTools, formatReport } = require('./scanner.js');

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('\n\x1b[1msint-scan\x1b[0m \x1b[2mv0.1.0\x1b[0m — MCP Server Security Scanner by SINT Protocol\n');
    console.log('  \x1b[1mUsage:\x1b[0m');
    console.log('    npx sint-scan --tools \'[{"name":"bash","description":"runs commands"}]\'');
    console.log('    echo \'[{"name":"readFile"}]\' | npx sint-scan --server myserver\n');
    console.log('  \x1b[1mOptions:\x1b[0m');
    console.log('    --server <id>    Server identifier (default: "unknown")');
    console.log('    --tools <json>   JSON array of MCP tool definitions');
    console.log('    --json           Output raw JSON report');
    console.log('    --help           Show this help\n');
    console.log('  \x1b[2mFull governance: https://sint.gg\x1b[0m');
    console.log('  \x1b[2mStar: https://github.com/sint-ai/sint-protocol\x1b[0m\n');
    process.exit(0);
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
    console.error('\x1b[31mError:\x1b[0m No tools provided. Use --tools or pipe JSON.\n');
    process.exit(1);
  }

  let tools;
  try {
    tools = JSON.parse(toolsJson);
    if (!Array.isArray(tools)) tools = [tools];
  } catch (e) {
    console.error('\x1b[31mError:\x1b[0m Invalid JSON: ' + e.message);
    process.exit(1);
  }

  const report = scanTools(tools, serverId);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  formatReport(report);
  process.exit(report.overallRisk === 'CRITICAL' ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
