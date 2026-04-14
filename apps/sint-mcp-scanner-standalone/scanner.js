'use strict';
// sint-scan/scanner.js — SINT Labs | Apache-2.0

const RESET = '\x1b[0m', BOLD = '\x1b[1m';
const RED = '\x1b[31m', YELLOW = '\x1b[33m', GREEN = '\x1b[32m';
const CYAN = '\x1b[36m', MAGENTA = '\x1b[35m', DIM = '\x1b[2m';

// ─── Tier definitions ────────────────────────────────────────────────────────

const TIERS = {
  T0: { name: 'OBSERVE', risk: 'LOW',      approval: false, color: GREEN },
  T1: { name: 'PREPARE', risk: 'MEDIUM',   approval: false, color: CYAN },
  T2: { name: 'ACT',     risk: 'HIGH',     approval: true,  color: YELLOW },
  T3: { name: 'COMMIT',  risk: 'CRITICAL', approval: true,  color: RED },
};

// ─── Pattern matching ────────────────────────────────────────────────────────

const SHELL_EXEC_PATTERNS = [
  /\b(bash|shell|exec|eval|run_command|execute|cmd|powershell|sh|zsh|fish)\b/i,
  /\bsystem\s*call/i, /\bsubprocess/i, /\bspawn\b/i,
];

const T3_PATTERNS = [
  /\b(delete|drop|destroy|remove|purge|wipe|truncate|format)\b/i,
  /\b(deploy|release|publish|push\s+to\s+prod)/i,
  /\b(payment|transaction|transfer|charge|invoice|billing)\b/i,
  /\b(sudo|root|admin|privilege\s*escalat)/i,
  /\b(irreversible|permanent|cannot\s+be\s+undone)\b/i,
  /\b(send\s+email|send\s+message|notify\s+user)/i,
  /\b(write\s+to\s+database|modify\s+schema)/i,
];

const T2_PATTERNS = [
  /\b(write|create|update|modify|edit|append|overwrite)\b/i,
  /\b(move|rename|copy|upload)\b/i,
  /\b(set|configure|install|enable|disable)\b/i,
  /\b(database|db|sql|postgres|mysql|mongo)\b/i,
  /\b(api\s+call|http\s+(post|put|patch|delete))\b/i,
  /\b(robot|actuator|servo|motor|gripper|arm)\b/i,
  /\b(git\s+(push|commit|merge|rebase))\b/i,
];

const T1_PATTERNS = [
  /\b(list|search|find|query|fetch|get|read)\b/i,
  /\b(analyze|parse|process|convert|transform)\b/i,
  /\b(check|verify|validate|test)\b/i,
];

const OWASP_CHECKS = {
  'ASI01': { pattern: /\b(system\s+prompt|role:\s*system|ignore\s+previous)\b/i, desc: 'Prompt injection vector in tool description' },
  'ASI02': { pattern: /\b(any\s+file|all\s+files|\*\*|glob|wildcard)\b/i, desc: 'Excessive file system access scope' },
  'ASI05': { pattern: SHELL_EXEC_PATTERNS[0], desc: 'Shell/exec command execution (OWASP ASI05)' },
  'ASI06': { pattern: /\b(password|secret|token|api.?key|credential|private.?key)\b/i, desc: 'Sensitive data exposure risk' },
  'ASI09': { pattern: /\b(recursive|loop|infinite|retry\s+forever)\b/i, desc: 'Resource exhaustion risk' },
};

// ─── Core scan logic ─────────────────────────────────────────────────────────

function classifyTool(tool) {
  const text = `${tool.name || ''} ${tool.description || ''}`;
  const reasons = [];
  const owasp = [];
  let tier = 'T0';

  // Check OWASP risks first
  for (const [code, check] of Object.entries(OWASP_CHECKS)) {
    const pattern = Array.isArray(check.pattern)
      ? check.pattern.some(p => p.test(text))
      : check.pattern.test(text);
    if (pattern) owasp.push({ code, desc: check.desc });
  }

  // Shell exec → always T3
  if (SHELL_EXEC_PATTERNS.some(p => p.test(text))) {
    tier = 'T3';
    reasons.push('Shell/command execution detected — OWASP ASI05');
  } else if (T3_PATTERNS.some(p => p.test(text))) {
    tier = 'T3';
    reasons.push('Irreversible/high-consequence action detected');
  } else if (T2_PATTERNS.some(p => p.test(text))) {
    tier = 'T2';
    reasons.push('Write/modify/configure operation detected');
  } else if (T1_PATTERNS.some(p => p.test(text))) {
    tier = 'T1';
    reasons.push('Read/query operation');
  } else {
    tier = 'T0';
    reasons.push('Observation/read-only — no risk signals');
  }

  // Annotations override
  if (tool.annotations) {
    if (tool.annotations.destructiveHint) { tier = 'T3'; reasons.push('destructiveHint: true'); }
    else if (tool.annotations.readOnlyHint) { tier = 'T0'; reasons.push('readOnlyHint: true'); }
  }

  const tierDef = TIERS[tier];
  return {
    toolName: tool.name || '(unnamed)',
    tier,
    tierName: tierDef.name,
    risk: tierDef.risk,
    requiresApproval: tierDef.approval,
    reasons,
    owasp,
    isShellExec: SHELL_EXEC_PATTERNS.some(p => p.test(text)),
  };
}

function riskOrder(r) {
  return { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }[r] ?? 0;
}

function scanTools(tools, serverId = 'unknown') {
  const results = tools.map(t => classifyTool(t));
  const overallRisk = results.reduce((max, r) =>
    riskOrder(r.risk) > riskOrder(max) ? r.risk : max, 'LOW');

  const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  results.forEach(r => byRisk[r.risk]++);

  const owaspHits = [...new Set(results.flatMap(r => r.owasp.map(o => o.code)))];
  const recommendations = [];

  if (byRisk.CRITICAL > 0) recommendations.push('Add SINT policy bundle with human_review_triggers on T3 tools');
  if (byRisk.HIGH > 0) recommendations.push('Enable T2 approval gate for write/modify operations');
  if (owaspHits.includes('ASI05')) recommendations.push('Sandbox shell-exec tools with path constraints and rate limits');
  if (owaspHits.includes('ASI06')) recommendations.push('Rotate any credentials that appear in tool descriptions');
  recommendations.push('Full governance: npx sint-scan --json | submit to sint.gg/scan');

  return {
    serverId, scannedAt: new Date().toISOString(),
    totalTools: tools.length, byRisk, overallRisk,
    owaspViolations: owaspHits, results, recommendations,
  };
}

// ─── Output formatting ───────────────────────────────────────────────────────

function riskColor(risk) {
  return { LOW: GREEN, MEDIUM: CYAN, HIGH: YELLOW, CRITICAL: `${BOLD}${RED}` }[risk] ?? RESET;
}

function formatReport(report) {
  console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  SINT MCP Security Scanner${RESET}  ${DIM}sint.gg${RESET}`);
  console.log(`${BOLD}${CYAN}══════════════════════════════════════════${RESET}`);
  console.log(`  Server:  ${BOLD}${report.serverId}${RESET}`);
  console.log(`  Tools:   ${report.totalTools}`);
  console.log(`  Risk:    ${riskColor(report.overallRisk)}${BOLD}${report.overallRisk}${RESET}`);
  if (report.owaspViolations.length > 0) {
    console.log(`  OWASP:   ${RED}${report.owaspViolations.join(', ')}${RESET}`);
  }
  console.log();

  // Tool list
  for (const r of report.results) {
    const c = riskColor(r.risk);
    const approval = r.requiresApproval ? ` ${YELLOW}⚠ human approval${RESET}` : '';
    console.log(`  ${c}${BOLD}[${r.tier}]${RESET} ${BOLD}${r.toolName}${RESET}${approval}`);
    for (const reason of r.reasons) {
      console.log(`       ${DIM}${reason}${RESET}`);
    }
    for (const o of r.owasp) {
      console.log(`       ${RED}OWASP ${o.code}: ${o.desc}${RESET}`);
    }
  }

  // Summary
  console.log(`\n  ${DIM}By tier: LOW=${report.byRisk.LOW}  MEDIUM=${report.byRisk.MEDIUM}  HIGH=${report.byRisk.HIGH}  CRITICAL=${report.byRisk.CRITICAL}${RESET}`);

  if (report.recommendations.length > 0) {
    console.log(`\n${BOLD}  Recommendations:${RESET}`);
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`);
    }
  }

  console.log(`\n${DIM}  Full governance layer: https://sint.gg${RESET}`);
  console.log(`${DIM}  Star: https://github.com/sint-ai/sint-protocol${RESET}\n`);
}

module.exports = { scanTools, formatReport };
