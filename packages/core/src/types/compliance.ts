/**
 * SINT Protocol — OWASP Agentic AI Top 10 compliance types.
 *
 * Maps SINT components to OWASP ASI categories so that compliance
 * teams and security auditors can trace coverage.
 *
 * Reference: OWASP Top 10 for Agentic Applications 2026
 * https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
 *
 * EU AI Act Article 14(4)(e): human supervisors must be able to interrupt
 * high-risk AI systems. SINT's CircuitBreakerPlugin fulfils this requirement.
 *
 * @module @sint/core/types/compliance
 */

/**
 * OWASP Agentic Security Issue (ASI) categories.
 * Each maps to one of the ten OWASP Agentic Top 10 risks.
 */
export enum OwaspAsi {
  /** ASI01 — Agent Goal Hijack: prompt injection redirects agent objectives. */
  ASI01_GOAL_HIJACK = "ASI01",
  /** ASI02 — Tool Misuse & Exploitation: tools invoked outside intended scope. */
  ASI02_TOOL_MISUSE = "ASI02",
  /** ASI03 — Agent Identity & Privilege Abuse: forged/stolen agent credentials. */
  ASI03_IDENTITY_ABUSE = "ASI03",
  /** ASI04 — Agentic Supply Chain Compromise: malicious plugins or tools. */
  ASI04_SUPPLY_CHAIN = "ASI04",
  /** ASI05 — Unexpected Code Execution: natural-language → arbitrary code path. */
  ASI05_CODE_EXECUTION = "ASI05",
  /** ASI06 — Memory & Context Poisoning: long-term context manipulation. */
  ASI06_MEMORY_POISONING = "ASI06",
  /** ASI07 — Insecure Inter-Agent Communication: spoofed agent-to-agent messages. */
  ASI07_INTER_AGENT = "ASI07",
  /** ASI08 — Cascading Agent Failures: automated pipeline failure propagation. */
  ASI08_CASCADE = "ASI08",
  /** ASI09 — Human-Agent Trust Exploitation: deceptive agent behavior toward humans. */
  ASI09_TRUST_EXPLOIT = "ASI09",
  /** ASI10 — Rogue Agents: agents exceeding authorized boundaries. */
  ASI10_ROGUE_AGENT = "ASI10",
}

/** Coverage level for a given OWASP ASI category. */
export type OwaspCoverageLevel =
  | "full"      // SINT fully enforces this at the gate
  | "partial"   // SINT mitigates some vectors but not all
  | "none";     // Not addressed

/** A single OWASP coverage entry. */
export interface OwaspCoverageEntry {
  readonly category: OwaspAsi;
  readonly level: OwaspCoverageLevel;
  /** Which SINT components implement this coverage. */
  readonly implementedBy: readonly string[];
  /** What SINT enforces for this category. */
  readonly description: string;
  /** Gaps — what SINT does NOT cover in this category. */
  readonly gaps?: string;
}
