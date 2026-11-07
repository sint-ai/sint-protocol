import svgkit as k

W = 1340
LANES = [("Bridge adapter", "slate"), ("PolicyGateway", "brand"),
         ("TokenResolver", "t1"), ("Plugin seats", "violet"),
         ("ApprovalQueue", "t2"), ("EvidenceLedger", "violet")]
LX = [130, 380, 620, 830, 1030, 1225]
TOP = 108

body = []
y = 196


def msg(a, b, text, note=None, step=None):
    global y
    x1, x2 = LX[a], LX[b]
    if a == b:
        body.append(f'  <path class="link" d="M{x1} {y} h86 v28 h-82"'
                    ' marker-end="url(#a)"/>')
        tx, anchor, extra = x1 + 100, 'start', 28
    else:
        body.append(f'  <path class="link" d="M{x1} {y} H{x2}"'
                    ' marker-end="url(#a)"/>')
        tx, anchor, extra = (x1 + x2) / 2, 'middle', 0
    label = f"{step}  {text}" if step else text
    body.append(f'  <text class="bd" x="{tx:g}" y="{y - 9}"'
                f' text-anchor="{anchor}" font-weight="650"'
                f' fill="var(--ink)">{label}</text>')
    y += 44 + extra
    if note:
        body.append(f'  <text class="edge" x="{tx:g}" y="{y - 26:g}"'
                    f' text-anchor="{anchor}">{note}</text>')
        y += 14


def band(title, sub=""):
    global y
    y += 16
    body.append(f'  <rect x="42" y="{y - 18}" width="{W - 84}" height="28"'
                ' rx="8" fill="var(--line-soft)" stroke="none"/>')
    body.append(f'  <text class="grp" x="58" y="{y + 1}">{title}</text>')
    if sub:
        body.append(f'  <text class="edge" x="{W - 58}" y="{y + 1}"'
                    f' text-anchor="end">{sub}</text>')
    y += 48


def aside(text, x=None, dy=-28):
    body.append(f'  <text class="edge" x="{x if x else LX[1] + 16}"'
                f' y="{y + dy}">{text}</text>')


msg(0, 1, "SintRequest")
body.append('  <text class="edge" x="56" y="208">requestId UUIDv7 · agentId · '
            'tokenId · resource · action · params · physicalContext · '
            'recentActions · consequenceContext</text>')
y += 18
aside("PluginFailureScope opens — an unexpected failure resolves at the "
      "T3_COMMIT baseline, never at allow", dy=-4)
y += 16

band("Pre-authorization", "nothing is trusted yet, not even the token id")
msg(1, 1, "sintRequestSchema.safeParse()", "invalid → deny MALFORMED_REQUEST",
    step="1")
msg(1, 3, "goalHijackDetector.analyze(params)",
    "ASI01 — deny GOAL_HIJACK at confidence ≥ 0.6", step="1a")
msg(1, 3, "memoryIntegrity.check(history)",
    "ASI06 — poisoned conversation or memory", step="1b-pre")
msg(1, 3, "circuitBreaker.state(agentId)",
    "ASI10 — OPEN denies instantly; HALF_OPEN lets one probe through",
    step="1b")

band("Authorization", "@pshkv/gate-capability-tokens")
msg(1, 2, "resolve(tokenId)", step="2")
msg(1, 1, "token.subject === request.agentId",
    "mismatch → deny SUBJECT_MISMATCH (ASI03 cross-agent token replay)",
    step="2a / 3b")
msg(1, 1, "revocation check",
    "fail-closed: an unknown revocation state denies", step="3")
msg(1, 1, "validateCapabilityToken()",
    "Ed25519 signature · expiry · resource glob · actions list  (ASI02)",
    step="4")
msg(1, 3, "authority · deployment · spatial · regulated data · corridor · "
    "rate limit · economy · supply chain", "ASI04, ASI08", step="4a–4e")

band("Tiering and envelope")
msg(1, 1, "assignTier(request)",
    "→ ApprovalTier + RiskTier + escalationReasons. Pure function; "
    "a tier only ever ratchets up.", step="5")
msg(1, 3, "CSML escalation · simulation evidence · SafetyPermitPlugin · "
    "attestation · verifiable compute",
    "SafetyPermitPlugin is fail-closed", step="5b–5f")
msg(1, 3, "argInjectionDetector.analyze(params)",
    "ASI05 — code execution smuggled through a parameter", step="6b")
msg(1, 1, "effective envelope = min(token constraints, dynamic overrides)",
    "an override may only tighten", step="6c–6e")
msg(1, 1, "checkConstraints()",
    "force · velocity · torque · jerk · angular velocity · geofence · "
    "human presence · consequence limits", step="7")
msg(1, 1, "checkForbiddenCombos(recentActions, action)",
    "filesystem.write → exec.run inside 60 s raises the required tier to "
    "T3_COMMIT", step="7b")

band("Outcome", "decideBytier()")
outcomes = [
    ("allow", ["T0_OBSERVE · T1_PREPARE", "auto-approved, with audit"], "t0"),
    ("escalate", ["T2_ACT", "30 s timeout, fallback deny"], "t2"),
    ("escalate", ["T3_COMMIT", "30 s timeout, fallback safe-stop"], "t3"),
    ("deny", ["any violation above", "reason + policyViolated"], "slate"),
    ("transform", ["regulated-data fallback route", "constraintOverrides"],
     "t1"),
]
ox = 62
for name, lines, acc in outcomes:
    body += k.card(ox, y, 238, 76, name, lines, accent=acc, title_mono=True)
    body += k.link(f"M{LX[1]} {y - 30} C{LX[1]} {y - 12} {ox + 119} {y - 22} "
                   f"{ox + 119} {y - 2}")
    ox += 246
y += 112

band("Evidence")
msg(1, 5, "append policy.evaluated",
    "and the approval.* / safety.* events raised along the way — "
    "append-only, previousHash chained", step="9")
msg(1, 3, "finalize() → economyPlugin.postIntercept()",
    "settlement runs only on allow, and only after the primary audit "
    "acknowledges")

H = y + 90
BOT = H - 72
p = k.head(W, H, "SINT Protocol — lifecycle of one SintRequest",
           "The numbered steps are the gateway's own, from evaluateRequest() "
           "in packages/policy-gateway/src/gateway.ts.")
for (name, acc), x in zip(LANES, LX):
    p += [f'  <path d="M{x} {TOP + 40} V{BOT}" fill="none"'
          ' stroke="var(--line-soft)" stroke-width="1.4"'
          ' stroke-dasharray="4 6"/>',
          f'  <rect x="{x - 86}" y="{TOP}" width="172" height="40" rx="9"'
          ' class="card"/>',
          f'  <rect x="{x - 86}" y="{TOP}" width="172" height="40" rx="9"'
          f' fill="var(--{acc})" fill-opacity="var(--wash)" stroke="none"/>',
          f'  <text class="bt" x="{x}" y="{TOP + 25}" text-anchor="middle"'
          f' fill="var(--{acc})">{name}</text>']
p += body
p += k.foot(W, H, [
    "Derived from: packages/policy-gateway/src/gateway.ts "
    "(intercept L647, evaluateRequest L667, decideBytier L1752) · "
    "tier-assigner.ts · constraint-checker.ts · forbidden-combos.ts · "
    "plugin-failures.ts · regulated-data-policy.ts · "
    "docs/conformance/owasp-asi-mapping.md",
])
k.write("../svg/02-request-lifecycle.svg", p)
