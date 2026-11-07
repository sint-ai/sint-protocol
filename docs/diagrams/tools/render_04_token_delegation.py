import svgkit as k

W, H = 1340, 726
p = k.head(W, H, "SINT Protocol — capability token delegation",
           "Every hop narrows the grant. There is no code path that widens "
           "one.")

HOPS = [
    ("Root token", "depth 0 · attenuated false", "brand",
     [("issuer", "root authority key"),
      ("subject", "agent A"),
      ("resource", "mcp://filesystem/*"),
      ("actions", "[call, cancel]"),
      ("maxVelocityMps", "1.5"),
      ("maxForceNewtons", "80"),
      ("expiresAt", "2026-12-31")]),
    ("Delegated", "depth 1 · attenuated true", "t1",
     [("issuer", "agent A"),
      ("subject", "agent B"),
      ("resource", "mcp://filesystem/*"),
      ("actions", "[call]            subset"),
      ("maxVelocityMps", "0.8           tightened"),
      ("maxForceNewtons", "50           tightened"),
      ("expiresAt", "2026-06-30     ≤ parent")]),
    ("Delegated", "depth 2 · attenuated true", "violet",
     [("issuer", "agent B"),
      ("subject", "agent C"),
      ("resource", "mcp://filesystem/*"),
      ("actions", "[call]"),
      ("maxVelocityMps", "0.4           tightened"),
      ("maxForceNewtons", "50          inherited"),
      ("geofence", "narrower polygon")]),
]

x, y, cw, ch = 46, 134, 332, 262
for i, (title, meta, acc, fields) in enumerate(HOPS):
    cx = x + i * (cw + 60)
    p += [f'  <rect x="{cx}" y="{y}" width="{cw}" height="{ch}" rx="14"'
          ' class="card" stroke-width="1.6"/>',
          f'  <rect x="{cx}" y="{y}" width="{cw}" height="{ch}" rx="14"'
          f' fill="var(--{acc})" fill-opacity="var(--wash)" stroke="none"/>',
          f'  <text class="bt" x="{cx + 18}" y="{y + 32}" font-size="15"'
          f' fill="var(--{acc})">{title}</text>',
          f'  <text class="bd mono" x="{cx + 18}" y="{y + 52}">{meta}</text>',
          f'  <line x1="{cx + 18}" y1="{y + 66}" x2="{cx + cw - 18}"'
          f' y2="{y + 66}" stroke="var(--line)" stroke-width="1"/>']
    fy = y + 90
    for key, val in fields:
        p += [f'  <text class="bd mono" x="{cx + 18}" y="{fy}"'
              f' font-size="10.5" fill="var(--faint)">{key}</text>',
              f'  <text class="bd mono" x="{cx + 150}" y="{fy}"'
              f' font-size="10.5" fill="var(--ink)">'
              + val.replace("  ", "&#160;&#160;") + '</text>']
        fy += 22
    if i < 2:
        ax = cx + cw
        p += k.link(f"M{ax + 4} {y + ch / 2} H{ax + 54}")
        p += [f'  <text class="edge" x="{ax + 29}" y="{y + ch / 2 - 12}"'
              ' text-anchor="middle" class="edge mono">delegate</text>',
              f'  <text class="edge" x="{ax + 29}" y="{y + ch / 2 + 24}"'
              ' text-anchor="middle">Capability</text>',
              f'  <text class="edge" x="{ax + 29}" y="{y + ch / 2 + 37}"'
              ' text-anchor="middle">Token()</text>']

# depth limit
dx = x + 3 * (cw + 60) - 60
p += k.card(dx + 4, y + 56, 228, 150, "depth 3 is the last hop",
            ["MAX_DELEGATION_DEPTH = 3,",
             "in packages/core/src/",
             "constants/tiers.ts.", "",
             "A fourth hop returns",
             "err(DELEGATION_DEPTH_",
             "EXCEEDED) and issues",
             "nothing."],
            accent="t3")
p += k.link(f"M{dx - 56} {y + ch / 2} H{dx}", soft=True)

ry = y + ch + 34
p += k.pane(46, ry, 1248, 232, "What delegateCapabilityToken() enforces at "
            "every hop — packages/capability-tokens/src/delegator.ts")
rules = [
    ("actions", "restrictActions ∩ parent.actions. An empty intersection "
     "returns err(INSUFFICIENT_PERMISSIONS)."),
    ("numeric limits", "min(parent, requested) for maxForceNewtons, "
     "maxVelocityMps, maxRepetitions and the consequence limits."),
    ("expiresAt", "capped at the parent's expiry — a longer request is "
     "silently clamped down, never honoured."),
    ("requiresHumanPresence", "true at the parent stays true. A child cannot "
     "switch the requirement off."),
    ("inherited, never widened", "timeWindow, rateLimit, quorum and "
     "sceneContractDigest come straight from the parent."),
    ("regulated data", "processors, regions, models, purposes and context "
     "fields narrow to a subset of the parent's lists."),
    ("parent must still hold", "the parent's signature and expiry are "
     "re-verified before any child token is issued."),
    ("no amplification", "the module exposes delegate only. There is no "
     "widen, grant or escalate operation to call."),
]
cx, cy = 66, ry + 38
for i, (name, text) in enumerate(rules):
    px = cx + (i % 2) * 614
    py = cy + (i // 2) * 48
    p += [f'  <text class="bt mono" x="{px}" y="{py}" font-size="12"'
          f' fill="var(--brand)">{name}</text>']
    words, line, lines = text.split(), "", []
    for wd in words:
        if len(line) + len(wd) > 72:
            lines.append(line)
            line = wd
        else:
            line = (line + " " + wd).strip()
    lines.append(line)
    for j, ln in enumerate(lines[:2]):
        p += [f'  <text class="bd" x="{px}" y="{py + 17 + j * 15}">{ln}'
              '</text>']

p += k.foot(W, H, [
    "Derived from: packages/capability-tokens/src/delegator.ts "
    "(delegateCapabilityToken L225, attenuateConstraints L53) · "
    "packages/core/src/types/capability-token.ts (SintCapabilityToken L402) · "
    "packages/core/src/constants/tiers.ts (MAX_DELEGATION_DEPTH)",
])
k.write("../svg/04-token-delegation.svg", p)
