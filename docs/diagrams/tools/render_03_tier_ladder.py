import svgkit as k

W, H = 1340, 776
p = k.head(W, H, "SINT Protocol — the T0–T3 approval ladder",
           "ApprovalTier decides who may say yes. RiskTier describes the "
           "consequence. Both are assigned by the same pure function.")

TIERS = [
    ("T0_OBSERVE", "T0_read", "t0", "auto-approve + audit",
     "Read-only. No physical state change.",
     ["ros2:///camera/*            subscribe",
      "mcp://filesystem/readFile   call",
      "mavlink://*/cmd/camera      call",
      "sint://interface/status     call"]),
    ("T1_PREPARE", "T1_write_low", "t1", "auto-approve + audit",
     "Idempotent writes and staging.",
     ["ros2:///waypoints           publish",
      "mcp://filesystem/writeFile  call",
      "open-rmf://*                prepare",
      "engine://system2/plan       create"]),
    ("T2_ACT", "T2_stateful", "t2", "escalate — human review",
     "Stateful change with a physical effect.",
     ["ros2:///cmd_vel             publish",
      "humanoid://*/arm/*/joint_commands",
      "mavlink://*/cmd/takeoff     call",
      "mqtt://*/*valve*            publish"]),
    ("T3_COMMIT", "T3_irreversible", "t3", "escalate — explicit approval",
     "Irreversible. Nothing undoes it.",
     ["mcp://exec/*                call",
      "mcp://*/transfer.*          call",
      "mavlink://*/cmd/arm         call",
      "ros2:///mode_change         publish"]),
]

x, y, cw, ch = 46, 136, 300, 272
for i, (tier, risk, acc, verdict, gloss, examples) in enumerate(TIERS):
    cx = x + i * (cw + 18)
    p += [f'  <rect x="{cx}" y="{y}" width="{cw}" height="{ch}" rx="14"'
          ' class="card" stroke-width="1.6"/>',
          f'  <rect x="{cx}" y="{y}" width="{cw}" height="{ch}" rx="14"'
          f' fill="var(--{acc})" fill-opacity="var(--wash)" stroke="none"/>',
          f'  <rect x="{cx}" y="{y}" width="{cw}" height="5" rx="2.5"'
          f' fill="var(--{acc})"/>',
          f'  <text class="bt mono" x="{cx + 18}" y="{y + 40}"'
          f' font-size="17" fill="var(--{acc})">{tier}</text>',
          f'  <text class="bd mono" x="{cx + 18}" y="{y + 60}">risk {risk}'
          '</text>',
          f'  <text class="bt" x="{cx + 18}" y="{y + 86}"'
          f' fill="var(--{acc})">{verdict}</text>',
          f'  <text class="bd" x="{cx + 18}" y="{y + 105}">{gloss}</text>',
          f'  <line x1="{cx + 18}" y1="{y + 120}" x2="{cx + cw - 18}"'
          f' y2="{y + 120}" stroke="var(--line)" stroke-width="1"/>',
          f'  <text class="grp" x="{cx + 18}" y="{y + 142}">'
          'resources that land here</text>']
    ey = y + 166
    for ex in examples:
        p += [f'  <text class="bd mono" x="{cx + 18}" y="{ey}"'
              ' font-size="10.5">' + ex.replace("  ", "&#160;&#160;")
              + '</text>']
        ey += 18
    if i < 3:
        p += k.link(f"M{cx + cw + 2} {y + ch / 2} H{cx + cw + 15}")

# auto vs human banner
p += [f'  <rect x="46" y="{y + ch + 16}" width="618" height="34" rx="9"'
      ' fill="var(--t0)" fill-opacity="var(--wash)" stroke="none"/>',
      f'  <text class="bt" x="64" y="{y + ch + 38}" fill="var(--t0)">'
      'Auto-approved by the gateway — logged, never silent</text>',
      f'  <rect x="682" y="{y + ch + 16}" width="612" height="34" rx="9"'
      ' fill="var(--t2)" fill-opacity="var(--wash)" stroke="none"/>',
      f'  <text class="bt" x="700" y="{y + ch + 38}" fill="var(--t2)">'
      'Escalated to a human — 30 s timeout, then the fallback action'
      '</text>']

ry = y + ch + 74
p += k.pane(46, ry, 1248, 232, "What raises a tier — assignTier(), "
            "packages/policy-gateway/src/tier-assigner.ts")
rules = [
    ("escalateOnHumanPresence", "+1 tier",
     ["physicalContext.humanDetected on a rule", "that opts in — e.g. "
      "ros2:///cmd_vel"], "t2"),
    ("escalateOnNewAgent", "+1 tier",
     ["agent trust level is untrusted or", "provisional"], "t2"),
    ("currentForceNewtons present", "floor T2_ACT",
     ["a reported force means the request is", "already in a physical "
      "context"], "t2"),
    ("reversibility = irreversible", "floor T3_COMMIT",
     ["a declared consequence outranks any", "resource naming"], "t3"),
    ("forbidden combo matched", "requiredTier",
     ["filesystem.write → exec.run inside 60 s", "is capability laundering"],
     "t3"),
    ("no rule matches", "default T1_PREPARE",
     ["but MCP semantics, exec.run and physical", "dispatch raise their own "
      "floors"], "t1"),
]
cx, cy = 66, ry + 38
for i, (name, effect, lines, acc) in enumerate(rules):
    px = cx + (i % 3) * 410
    py = cy + (i // 3) * 92
    p += [f'  <rect x="{px}" y="{py}" width="388" height="78" rx="10"'
          ' class="card"/>',
          f'  <rect x="{px}" y="{py + 1}" width="4" height="76" rx="2"'
          f' fill="var(--{acc})"/>',
          f'  <text class="bt mono" x="{px + 16}" y="{py + 24}"'
          f' font-size="12.5">{name}</text>',
          f'  <text class="bt mono" x="{px + 372}" y="{py + 24}"'
          f' text-anchor="end" fill="var(--{acc})">{effect}</text>',
          f'  <text class="bd" x="{px + 16}" y="{py + 46}">{lines[0]}</text>',
          f'  <text class="bd" x="{px + 16}" y="{py + 62}">{lines[1]}</text>']

p += k.foot(W, H, [
    "Derived from: packages/core/src/types/policy.ts (ApprovalTier, "
    "RiskTier) · packages/core/src/constants/tiers.ts (DEFAULT_TIER_RULES) · "
    "packages/core/src/constants/forbidden-combos.ts · "
    "packages/policy-gateway/src/tier-assigner.ts · gateway.ts decideBytier()",
])
k.write("../svg/03-tier-ladder.svg", p)
