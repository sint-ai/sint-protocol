/**
 * SINT Protocol — ASI05 Argument Injection Detection.
 *
 * Detects shell injection, path traversal, environment variable injection,
 * and code patterns in agent request parameters. Closes the ASI05 gap:
 * "No semantic analysis of tool arguments for code injection".
 *
 * Detection heuristics (layered, fail-open):
 * 1. Shell metacharacters combined with dangerous command keywords → high
 * 2. Path traversal sequences (../../, /etc/, /proc/, ~/.ssh/) → medium
 * 3. Environment variable injection ($HOME, ${...}, %APPDATA%) → medium
 * 4. Code patterns in unexpected string fields (import os, subprocess, exec(), eval()) → high
 */

export interface ArgInjectionResult {
  readonly detected: boolean;
  readonly patterns: readonly string[];
  readonly severity: "low" | "medium" | "high";
  readonly confidence: number;
}

export interface ArgInjectionDetector {
  analyze(params: Record<string, unknown>, resource: string): ArgInjectionResult;
}

interface PatternDef {
  readonly name: string;
  readonly regex: RegExp;
  readonly severity: "low" | "medium" | "high";
  readonly weight: number;
}

const SHELL_META_PATTERNS: readonly PatternDef[] = [
  {
    name: "shell:semicolon-command",
    regex: /;\s*(rm|curl|wget|nc|bash|sh|python|python3|perl|ruby|eval|exec)\b/i,
    severity: "high",
    weight: 0.9,
  },
  {
    name: "shell:and-command",
    regex: /&&\s*(rm|curl|wget|nc|bash|sh|python|python3|perl|ruby|eval|exec)\b/i,
    severity: "high",
    weight: 0.9,
  },
  {
    name: "shell:or-command",
    regex: /\|\|\s*(rm|curl|wget|nc|bash|sh|python|python3|perl|ruby|eval|exec)\b/i,
    severity: "high",
    weight: 0.9,
  },
  {
    name: "shell:pipe-command",
    regex: /\|\s*(rm|curl|wget|nc|bash|sh|python|python3|perl|ruby|eval|exec)\b/i,
    severity: "high",
    weight: 0.9,
  },
  {
    name: "shell:subshell",
    regex: /\$\([\w\s\/\-\.]+\)/,
    severity: "high",
    weight: 0.85,
  },
  {
    name: "shell:backtick",
    // eslint-disable-next-line no-useless-escape
    regex: /`[^`]+`/,
    severity: "high",
    weight: 0.85,
  },
  {
    name: "shell:redirect-write",
    regex: />\s*\S+/,
    severity: "medium",
    weight: 0.6,
  },
  {
    name: "shell:redirect-append",
    regex: />>\s*\S+/,
    severity: "medium",
    weight: 0.6,
  },
  {
    name: "shell:redirect-read",
    regex: /<\s*\S+/,
    severity: "medium",
    weight: 0.5,
  },
  {
    name: "shell:rm-rf",
    regex: /\brm\s+-[rf]+\s*\//i,
    severity: "high",
    weight: 0.95,
  },
  {
    name: "shell:curl-exfil",
    regex: /\bcurl\b.*https?:\/\//i,
    severity: "high",
    weight: 0.9,
  },
  {
    name: "shell:wget-exfil",
    regex: /\bwget\b.*https?:\/\//i,
    severity: "high",
    weight: 0.9,
  },
  {
    name: "shell:netcat",
    regex: /\bnc\b\s+-/i,
    severity: "high",
    weight: 0.9,
  },
];

const PATH_TRAVERSAL_PATTERNS: readonly PatternDef[] = [
  {
    name: "path-traversal:dotdot-slash",
    regex: /\.\.[\\/]/,
    severity: "medium",
    weight: 0.7,
  },
  {
    name: "path-traversal:etc",
    regex: /\/etc\/(passwd|shadow|hosts|sudoers|crontab|ssh)/i,
    severity: "high",
    weight: 0.85,
  },
  {
    name: "path-traversal:etc-any",
    regex: /\/etc\//,
    severity: "medium",
    weight: 0.6,
  },
  {
    name: "path-traversal:proc",
    regex: /\/proc\//,
    severity: "medium",
    weight: 0.6,
  },
  {
    name: "path-traversal:ssh-keys",
    regex: /~\/\.ssh\//,
    severity: "high",
    weight: 0.9,
  },
  {
    name: "path-traversal:root-home",
    regex: /\/root\//,
    severity: "high",
    weight: 0.8,
  },
];

const ENV_INJECTION_PATTERNS: readonly PatternDef[] = [
  {
    name: "env-inject:dollar-home",
    regex: /\$HOME\b/,
    severity: "medium",
    weight: 0.65,
  },
  {
    name: "env-inject:dollar-path",
    regex: /\$PATH\b/,
    severity: "medium",
    weight: 0.65,
  },
  {
    name: "env-inject:dollar-brace",
    regex: /\$\{[A-Z_][A-Z0-9_]*\}/,
    severity: "medium",
    weight: 0.65,
  },
  {
    name: "env-inject:percent-appdata",
    regex: /%APPDATA%/i,
    severity: "medium",
    weight: 0.6,
  },
  {
    name: "env-inject:percent-systemroot",
    regex: /%SYSTEMROOT%/i,
    severity: "medium",
    weight: 0.6,
  },
  {
    name: "env-inject:dollar-env-var",
    regex: /\$[A-Z_][A-Z0-9_]{2,}/,
    severity: "low",
    weight: 0.4,
  },
];

const CODE_PATTERN_DEFS: readonly PatternDef[] = [
  {
    name: "code:import-os",
    regex: /\bimport\s+os\b/,
    severity: "high",
    weight: 0.85,
  },
  {
    name: "code:subprocess",
    regex: /\bsubprocess\b/,
    severity: "high",
    weight: 0.85,
  },
  {
    name: "code:exec-call",
    regex: /\bexec\s*\(/,
    severity: "high",
    weight: 0.85,
  },
  {
    name: "code:eval-call",
    regex: /\beval\s*\(/,
    severity: "high",
    weight: 0.85,
  },
  {
    name: "code:os-system",
    regex: /\bos\.system\s*\(/,
    severity: "high",
    weight: 0.9,
  },
  {
    name: "code:os-popen",
    regex: /\bos\.popen\s*\(/,
    severity: "high",
    weight: 0.9,
  },
  {
    name: "code:import-subprocess",
    regex: /\bimport\s+subprocess\b/,
    severity: "high",
    weight: 0.85,
  },
  {
    name: "code:require-child-process",
    regex: /require\s*\(\s*['"]child_process['"]\s*\)/,
    severity: "high",
    weight: 0.85,
  },
  {
    name: "code:spawn-exec",
    regex: /\b(spawn|execFile|execSync|spawnSync)\s*\(/,
    severity: "high",
    weight: 0.8,
  },
];

const ALL_PATTERNS: readonly PatternDef[] = [
  ...SHELL_META_PATTERNS,
  ...PATH_TRAVERSAL_PATTERNS,
  ...ENV_INJECTION_PATTERNS,
  ...CODE_PATTERN_DEFS,
];

/** Extract all string values from a nested object/array recursively. */
function extractStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractStrings(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      extractStrings(v),
    );
  }
  return [];
}

function maxSeverity(a: "low" | "medium" | "high", b: "low" | "medium" | "high"): "low" | "medium" | "high" {
  const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };
  return (rank[a] ?? 0) >= (rank[b] ?? 0) ? a : b;
}

export class DefaultArgInjectionDetector implements ArgInjectionDetector {
  private readonly confidenceThreshold: number;

  constructor(config?: { confidenceThreshold?: number }) {
    this.confidenceThreshold = config?.confidenceThreshold ?? 0.5;
  }

  analyze(params: Record<string, unknown>, _resource: string): ArgInjectionResult {
    const strings = extractStrings(params);
    const combined = strings.join(" ");

    const matched: PatternDef[] = [];

    for (const pattern of ALL_PATTERNS) {
      if (pattern.regex.test(combined)) {
        matched.push(pattern);
      }
    }

    if (matched.length === 0) {
      return {
        detected: false,
        patterns: [],
        severity: "low",
        confidence: 0,
      };
    }

    // Confidence = max weight among matched patterns plus small multi-match bonus
    const maxWeight = Math.max(...matched.map((p) => p.weight));
    const typeBonus = Math.min((matched.length - 1) * 0.05, 0.15);
    const confidence = Math.min(maxWeight + typeBonus, 1.0);

    // Effective severity = max severity across all matched patterns
    let effectiveSeverity: "low" | "medium" | "high" = "low";
    for (const p of matched) {
      effectiveSeverity = maxSeverity(effectiveSeverity, p.severity);
    }

    const patternNames = matched.map((p) => p.name);
    const detected = confidence > this.confidenceThreshold;

    return {
      detected,
      patterns: patternNames,
      severity: effectiveSeverity,
      confidence,
    };
  }
}
