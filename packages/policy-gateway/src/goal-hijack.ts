/**
 * SINT Protocol — ASI01 Goal Hijack Detection.
 *
 * Detects prompt injection and semantic goal manipulation in agent
 * request parameters. Covers OWASP Agentic Top 10 ASI01.
 *
 * Detection heuristics (layered, fail-open):
 * 1. Prompt injection patterns: "ignore previous", "disregard", "new instruction", etc.
 * 2. Role override attempts: "you are now", "act as", "pretend you are", "DAN"
 * 3. Cross-agent instruction injection: action params containing agent commands
 * 4. Semantic escalation: params contain tier-upgrade attempts ("approve this", "authorize")
 * 5. System prompt exfiltration probes: "repeat your instructions", "what is your prompt"
 */

export interface GoalHijackResult {
  readonly hijackDetected: boolean;
  readonly confidence: number; // 0.0 - 1.0
  readonly patterns: readonly string[]; // matched pattern names
  readonly reason?: string;
}

export interface GoalHijackPlugin {
  /** Returns hijack analysis for a request's params and resource. */
  analyze(
    params: Record<string, unknown>,
    resource: string,
    action: string,
  ): GoalHijackResult;
}

interface PatternDef {
  readonly name: string;
  readonly regex: RegExp;
  readonly weight: number;
}

const PROMPT_INJECTION_PATTERNS: readonly PatternDef[] = [
  { name: "prompt-inject:ignore-previous", regex: /ignore\s+(previous|prior|all\s+previous)\s+instructions?/i, weight: 0.8 },
  { name: "prompt-inject:disregard", regex: /disregard\s+(all\s+)?(previous|prior|above|system)\s+instructions?/i, weight: 0.8 },
  { name: "prompt-inject:new-instruction", regex: /new\s+instruction[:\s]/i, weight: 0.8 },
  { name: "prompt-inject:override-instruction", regex: /override\s+(your\s+)?(instruction|directive|rule|goal)/i, weight: 0.8 },
  { name: "prompt-inject:forget", regex: /forget\s+(everything|all|your)\s+(above|previous|prior|instructions?)/i, weight: 0.8 },
];

const ROLE_OVERRIDE_PATTERNS: readonly PatternDef[] = [
  { name: "role-override:you-are-now", regex: /you\s+are\s+now\s+a?\s*\w/i, weight: 0.9 },
  { name: "role-override:act-as", regex: /act\s+as\s+(a\s+)?\w/i, weight: 0.9 },
  { name: "role-override:pretend", regex: /pretend\s+(you\s+are|to\s+be)\s+/i, weight: 0.9 },
  { name: "role-override:dan", regex: /\bDAN\b/, weight: 0.9 },
  { name: "role-override:jailbreak", regex: /jailbreak/i, weight: 0.9 },
  { name: "role-override:different-agent", regex: /you\s+are\s+(now\s+)?a\s+different\s+agent/i, weight: 0.9 },
];

const ESCALATION_PATTERNS: readonly PatternDef[] = [
  { name: "escalation:approve-this", regex: /approve\s+this\s+(action|request|operation)/i, weight: 0.7 },
  { name: "escalation:authorize", regex: /\bauthorize\s+(me|this|the\s+following)/i, weight: 0.7 },
  { name: "escalation:grant-permission", regex: /grant\s+(me\s+)?(permission|access|privilege)/i, weight: 0.7 },
  { name: "escalation:elevate", regex: /elevate\s+(my\s+)?(privilege|access|tier|permission)/i, weight: 0.7 },
  { name: "escalation:bypass", regex: /bypass\s+(the\s+)?(policy|gateway|check|restriction|limit)/i, weight: 0.7 },
];

const EXFIL_PATTERNS: readonly PatternDef[] = [
  { name: "exfil:repeat-instructions", regex: /repeat\s+(your\s+)?(system\s+)?(prompt|instruction)/i, weight: 0.7 },
  { name: "exfil:what-is-your-prompt", regex: /what\s+is\s+your\s+(system\s+)?prompt/i, weight: 0.7 },
  { name: "exfil:print-instructions", regex: /print\s+(your\s+)?(system\s+)?(prompt|instruction)/i, weight: 0.7 },
  { name: "exfil:show-instructions", regex: /show\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instruction)/i, weight: 0.7 },
  { name: "exfil:output-initial", regex: /output\s+(your\s+)?(initial|original)\s+(prompt|instruction)/i, weight: 0.7 },
];

const CROSS_AGENT_PATTERNS: readonly PatternDef[] = [
  { name: "cross-agent:inject-command", regex: /(execute|run|call)\s+(agent|tool|command)[\s:]/i, weight: 0.6 },
  { name: "cross-agent:send-to-agent", regex: /send\s+(this\s+)?(message\s+)?to\s+agent/i, weight: 0.6 },
  { name: "cross-agent:instruct-agent", regex: /instruct\s+(the\s+)?(other\s+)?agent/i, weight: 0.6 },
  { name: "cross-agent:forward-to", regex: /forward\s+(this\s+)?(to\s+|instruction\s+to\s+)/i, weight: 0.6 },
];

const ALL_PATTERNS: readonly PatternDef[] = [
  ...PROMPT_INJECTION_PATTERNS,
  ...ROLE_OVERRIDE_PATTERNS,
  ...ESCALATION_PATTERNS,
  ...EXFIL_PATTERNS,
  ...CROSS_AGENT_PATTERNS,
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

export class DefaultGoalHijackDetector implements GoalHijackPlugin {
  private readonly threshold: number;

  constructor(config?: { threshold?: number }) {
    this.threshold = config?.threshold ?? 0.6;
  }

  analyze(
    params: Record<string, unknown>,
    _resource: string,
    _action: string,
  ): GoalHijackResult {
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
        hijackDetected: false,
        confidence: 0,
        patterns: [],
      };
    }

    // Confidence = max weight among matched patterns (dominant signal)
    // Plus a small additive bonus for multiple distinct pattern types.
    const maxWeight = Math.max(...matched.map((p) => p.weight));
    const typeBonus = Math.min((matched.length - 1) * 0.05, 0.15);
    const confidence = Math.min(maxWeight + typeBonus, 1.0);

    const patternNames = matched.map((p) => p.name);
    const hijackDetected = confidence >= this.threshold;

    return {
      hijackDetected,
      confidence,
      patterns: patternNames,
      reason: hijackDetected
        ? `Goal hijack detected (confidence=${confidence.toFixed(2)}): ${patternNames.join(", ")}`
        : undefined,
    };
  }
}
