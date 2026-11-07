import svgkit as k

W, H = 1340, 1020
p = k.head(W, H, "SINT Protocol — defence map, OWASP ASI01–ASI10",
           "Every control sits at the same choke point. The checkpoint "
           "column is the step number inside evaluateRequest().")

ROWS = [
    ("ASI01", "Goal hijack / prompt injection", "1a — before token resolution",
     "DefaultGoalHijackDetector", "goal-hijack.ts",
     "deny GOAL_HIJACK at confidence ≥ 0.6", "fail-open", "t3"),
    ("ASI02", "Tool misuse / resource scope abuse", "4 — token validation",
     "validateCapabilityToken + assignTier", "capability-tokens/src",
     "RESOURCE_MISMATCH · ACTION_NOT_PERMITTED", "fail-closed", "t1"),
    ("ASI03", "Identity abuse / token forgery", "3–4 — revocation + signature",
     "validateCapabilityToken", "capability-tokens/src",
     "TOKEN_EXPIRED · INVALID_TOKEN · SUBJECT_MISMATCH", "fail-closed", "t1"),
    ("ASI04", "Supply chain / model fingerprint", "4e — after token validation",
     "DefaultSupplyChainVerifier", "supply-chain.ts",
     "SUPPLY_CHAIN_VIOLATION on a high-severity miss", "fail-open", "t2"),
    ("ASI05", "Unsafe code execution", "5, 6b, 7b — tier, args, combos",
     "assignTier · DefaultArgInjectionDetector · checkForbiddenCombos",
     "tier-assigner.ts · arg-injection-detector.ts · forbidden-combos.ts",
     "mcp://exec/* floors at T3_COMMIT", "mixed", "t3"),
    ("ASI06", "Memory poisoning / context injection", "1b-pre — before the "
     "breaker", "DefaultMemoryIntegrityChecker", "memory-integrity.ts",
     "high severity denies; medium warns and allows", "fail-open", "t2"),
    ("ASI07", "Inter-agent trust / delegation chain",
     "delegation time, step 4, and the A2A bridge",
     "delegateCapabilityToken · A2AInterceptor",
     "capability-tokens/src/delegator.ts · bridge-a2a/src",
     "attenuation only, MAX_DELEGATION_DEPTH = 3", "fail-closed", "t1"),
    ("ASI08", "Resource exhaustion", "4b rate limit · 1b circuit breaker",
     "InMemoryRateLimitStore · InMemoryCircuitBreaker",
     "@pshkv/persistence · circuit-breaker.ts",
     "per-token sliding window; breaker opens on repeated denial",
     "fail-closed", "violet"),
    ("ASI09", "Human oversight bypass", "5–7 — tier then escalation",
     "assignTier · ApprovalQueue", "approval-flow.ts",
     "T2 falls back to deny, T3 to safe-stop", "fail-closed", "t2"),
    ("ASI10", "Rogue / autonomous agent", "1b breaker state · 5c CSML auto-trip",
     "InMemoryCircuitBreaker", "circuit-breaker.ts",
     "OPEN denies instantly; an anomalous persona trips the breaker",
     "fail-closed", "t3"),
]

COLS = [(46, 76), (130, 268), (404, 236), (646, 318), (970, 324)]
HEAD = ["", "Threat", "Checkpoint in intercept()", "Implementation",
        "Effect at runtime"]
y = 128
for (cx, cw), h in zip(COLS, HEAD):
    if h:
        p += [f'  <text class="grp" x="{cx}" y="{y}">{h}</text>']
y += 14
p += [f'  <line x1="46" y1="{y}" x2="{W - 46}" y2="{y}"'
      ' stroke="var(--line)" stroke-width="1.2"/>']
y += 10

for i, (aid, threat, checkpoint, impl, where, effect, mode, acc) in \
        enumerate(ROWS):
    rh = 64
    if i % 2 == 0:
        p += [f'  <rect x="46" y="{y}" width="{W - 92}" height="{rh}"'
              ' rx="9" fill="var(--surface2)" stroke="none"/>']
    p += [f'  <rect x="46" y="{y + 8}" width="4" height="{rh - 16}" rx="2"'
          f' fill="var(--{acc})"/>',
          f'  <text class="bt mono" x="60" y="{y + 28}" font-size="13"'
          f' fill="var(--{acc})">{aid}</text>',
          f'  <text class="bd" x="60" y="{y + 48}" font-size="10"'
          f' fill="var(--faint)">{mode}</text>',
          f'  <text class="bt" x="{COLS[1][0]}" y="{y + 28}"'
          f' font-size="12.5">{threat}</text>',
          f'  <text class="bd" x="{COLS[2][0]}" y="{y + 28}">{checkpoint}'
          '</text>']
    # implementation may wrap
    impl_lines, line = [], ""
    for word in impl.split(" "):
        if len(line) + len(word) > 42:
            impl_lines.append(line)
            line = word
        else:
            line = (line + " " + word).strip()
    impl_lines.append(line)
    iy = y + 26 if len(impl_lines) == 1 else y + 20
    for ln in impl_lines[:2]:
        p += [f'  <text class="bd mono" x="{COLS[3][0]}" y="{iy}"'
              f' font-size="10.5" fill="var(--ink)">{ln}</text>']
        iy += 14
    p += [f'  <text class="bd" x="{COLS[3][0]}" y="{y + 52}"'
          ' font-size="9.5" fill="var(--faint)">' + where + '</text>']
    eff_lines, line = [], ""
    for word in effect.split(" "):
        if len(line) + len(word) > 46:
            eff_lines.append(line)
            line = word
        else:
            line = (line + " " + word).strip()
    eff_lines.append(line)
    ey = y + 28 if len(eff_lines) == 1 else y + 22
    for ln in eff_lines[:2]:
        p += [f'  <text class="bd" x="{COLS[4][0]}" y="{ey}">{ln}</text>']
        ey += 15
    y += rh + 4

y += 18
notes = [
    ("Fail behaviour is per seat", "SafetyPermitPlugin is fail-closed: no "
     "external safety answer means no action. Advisory seats such as goal "
     "hijack and supply chain are fail-open — a plugin error does not block "
     "the request, and the fault rides along on the decision.", "t3"),
    ("Unexpected failure", "PluginFailureScope resolves an unhandled gateway "
     "failure at the T3_COMMIT baseline. The gateway never degrades towards "
     "allow.", "t2"),
    ("Coverage is executable", "Each control is pinned by fixtures in "
     "packages/conformance-tests/fixtures/security/"
     "owasp-asi-conformance.v1.json, run by owasp-asi-conformance.test.ts.",
     "brand"),
]
nx = 46
for title, text, acc in notes:
    lines, line = [], ""
    for word in text.split(" "):
        if len(line) + len(word) > 50:
            lines.append(line)
            line = word
        else:
            line = (line + " " + word).strip()
    lines.append(line)
    p += k.card(nx, y, 404, 108, title, lines[:5], accent=acc)
    nx += 422

p += k.foot(W, H, [
    "Derived from: docs/conformance/owasp-asi-mapping.md "
    "(status: Certified, Phase 3) · packages/policy-gateway/src/index.ts "
    "(exported plugin interfaces) · "
    "packages/conformance-tests/fixtures/security/"
    "owasp-asi-conformance.v1.json",
])
k.write("../svg/07-defence-map.svg", p)
