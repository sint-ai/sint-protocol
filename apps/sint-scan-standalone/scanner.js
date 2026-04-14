'use strict';
// sint-scan/scanner.js — SINT Labs | Apache-2.0

const R = '\x1b[0m', B = '\x1b[1m', D = '\x1b[2m';
const RED = '\x1b[31m', YLW = '\x1b[33m', GRN = '\x1b[32m', CYN = '\x1b[36m';

const SHELL_PATTERNS = [
  /\b(bash|shell|exec|eval|run_command|execute|cmd|powershell|sh|zsh|fish|terminal)\b/i,
  /\bsubprocess\b/i, /\bspawn\b/i, /\bsystem\s*call/i,
];

const T3_PATTERNS = [
  /\b(delete|drop|destroy|remove|purge|wipe|truncate|format)\b/i,
  /\b(deploy|release|publish|push\s+to\s+prod)/i,
  /\b(payment|transaction|transfer|charge|invoice|billing)\b/i,
  /\b(sudo|root|privilege.?escalat)/i,
  /\b(send\s+email|send\s+message|notify\s+user)/i,
  /\b(irreversible|cannot\s+be\s+undone|permanent)/i,
];

const T2_PATTERNS = [
  /\b(write|create|update|modify|edit|append|overwrite|set)\b/i,
  /\b(move|rename|copy|upload|configure|install)\b/i,
  /\b(database|db|sql|postgres|mysql|mongo)\b/i,
  /\b(http\s+(post|put|patch|delete)|api\s+call)\b/i,
  /\b(robot|actuator|servo|motor|gripper|arm|drone)\b/i,
  /\b(git\s+(push|commit|merge|rebase))\b/i,
];

const T1_PATTERNS = [
  /\b(list|search|find|query|fetch|get|read|analyze|parse|check|verify)\b/i,
];

const OWASP = {
  'ASI01': { p: /\b(system\s+prompt|ignore\s+previous|disregard)\b/i, d: 'Prompt injection vector' },
  'ASI02': { p: /\b(any\s+file|all\s+files|\*\*|glob|wildcard)\b/i, d: 'Excessive file access scope' },
  'ASI05': { p: SHELL_PATTERNS[0], d: 'Shell/exec execution (OWASP ASI05)' },
  'ASI06': { p: /\b(password|secret|token|api.?key|credential|private.?key)\b/i, d: 'Sensitive data exposure' },
};

function classify(tool) {
  const text = `${tool.name||''} ${tool.description||''}`;
  const reasons = [];
  const owasp = [];

  for (const [code, check] of Object.entries(OWASP)) {
    const hit = Array.isArray(check.p) ? check.p.some(p => p.test(text)) : check.p.test(text);
    if (hit) owasp.push({ code, desc: check.d });
  }

  let tier = 'T0';
  if (SHELL_PATTERNS.some(p => p.test(text))) {
    tier = 'T3'; reasons.push('Shell/command execution — OWASP ASI05');
  } else if (T3_PATTERNS.some(p => p.test(text))) {
    tier = 'T3'; reasons.push('Irreversible/high-consequence action');
  } else if (T2_PATTERNS.some(p => p.test(text))) {
    tier = 'T2'; reasons.push('Write/modify/configure operation');
  } else if (T1_PATTERNS.some(p => p.test(text))) {
    tier = 'T1'; reasons.push('Read/query operation');
  } else {
    reasons.push('No risk signals detected');
  }

  if (tool.annotations?.destructiveHint) { tier = 'T3'; reasons.push('destructiveHint: true'); }
  else if (tool.annotations?.readOnlyHint) { tier = 'T0'; reasons.push('readOnlyHint: true'); }

  const riskMap = { T0: 'LOW', T1: 'MEDIUM', T2: 'HIGH', T3: 'CRITICAL' };
  const risk = riskMap[tier];
  return {
    toolName: tool.name || '(unnamed)', tier, risk,
    requiresApproval: tier === 'T2' || tier === 'T3',
    isShellExec: SHELL_PATTERNS.some(p => p.test(text)),
    reasons, owasp,
  };
}

const riskOrder = r => ({ LOW:0, MEDIUM:1, HIGH:2, CRITICAL:3 }[r]??0);

function scanTools(tools, serverId = 'unknown') {
  const results = tools.map(classify);
  const overallRisk = results.reduce((m, r) => riskOrder(r.risk) > riskOrder(m) ? r.risk : m, 'LOW');
  const byRisk = { LOW:0, MEDIUM:0, HIGH:0, CRITICAL:0 };
  results.forEach(r => byRisk[r.risk]++);
  const owaspHits = [...new Set(results.flatMap(r => r.owasp.map(o => o.code)))];
  const recommendations = [];
  if (byRisk.CRITICAL > 0) recommendations.push('Add SINT policy bundle with human_review_triggers on T3 tools');
  if (byRisk.HIGH > 0) recommendations.push('Enable T2 approval gate for write/modify operations');
  if (owaspHits.includes('ASI05')) recommendations.push('Sandbox shell-exec tools — see sint.gg/docs/policy-bundles');
  if (owaspHits.includes('ASI06')) recommendations.push('Rotate any credentials visible in tool descriptions');
  recommendations.push('Full governance layer: https://sint.gg');
  return { serverId, scannedAt: new Date().toISOString(), totalTools: tools.length, byRisk, overallRisk, owaspViolations: owaspHits, results, recommendations };
}

function riskColor(r) {
  return { LOW: GRN, MEDIUM: CYN, HIGH: YLW, CRITICAL: B+RED }[r] ?? R;
}

function formatReport(report) {
  console.log(`\n${B}${CYN}══════════════════════════════════════════${R}`);
  console.log(`${B}  SINT MCP Security Scanner${R}  ${D}sint.gg${R}`);
  console.log(`${B}${CYN}══════════════════════════════════════════${R}`);
  console.log(`  Server:  ${B}${report.serverId}${R}`);
  console.log(`  Tools:   ${report.totalTools}`);
  console.log(`  Risk:    ${riskColor(report.overallRisk)}${B}${report.overallRisk}${R}`);
  if (report.owaspViolations.length) console.log(`  OWASP:   ${RED}${report.owaspViolations.join(', ')}${R}`);
  console.log();
  for (const r of report.results) {
    const c = riskColor(r.risk);
    const appr = r.requiresApproval ? ` ${YLW}⚠ human approval${R}` : '';
    console.log(`  ${c}${B}[${r.tier}]${R} ${B}${r.toolName}${R}${appr}`);
    for (const x of r.reasons) console.log(`       ${D}${x}${R}`);
    for (const o of r.owasp) console.log(`       ${RED}OWASP ${o.code}: ${o.desc}${R}`);
  }
  console.log(`\n  ${D}LOW=${report.byRisk.LOW}  MEDIUM=${report.byRisk.MEDIUM}  HIGH=${report.byRisk.HIGH}  CRITICAL=${report.byRisk.CRITICAL}${R}`);
  if (report.recommendations.length) {
    console.log(`\n${B}  Recommendations:${R}`);
    for (const rec of report.recommendations) console.log(`  • ${rec}`);
  }
  console.log(`\n${D}  Star: github.com/sint-ai/sint-protocol${R}\n`);
}

module.exports = { scanTools, formatReport };
