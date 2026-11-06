import svgkit as k

W, H = 1320, 700
p = k.head(W, H, "SINT Protocol — system context",
           "Every agent action reaches the physical world through one "
           "function: PolicyGateway.intercept().")

# ── panes ────────────────────────────────────────────────────────────────
p += k.pane(36, 110, 214, 300, "Agent intent")
p += k.pane(290, 110, 258, 530, "Bridge adapters")
p += k.pane(1038, 110, 246, 300, "Tools & physical world")

# ── agents ───────────────────────────────────────────────────────────────
agents = [
    ("LLM / MCP client", ["tool calls"]),
    ("Autonomy stack", ["System 1 · System 2"]),
    ("Peer agent", ["A2A · swarm"]),
]
ay = 150
for t, b in agents:
    p += k.card(56, ay, 174, 62, t, b, accent="violet")
    ay += 86

# ── bridges ──────────────────────────────────────────────────────────────
bridges = [
    ("MCPInterceptor", "@pshkv/bridge-mcp"),
    ("ROS2Interceptor", "@pshkv/bridge-ros2"),
    ("MAVLinkInterceptor", "@pshkv/bridge-mavlink"),
    ("IotInterceptor", "@pshkv/bridge-iot"),
    ("A2AInterceptor", "@pshkv/bridge-a2a"),
    ("SwarmCoordinator", "@pshkv/bridge-swarm"),
    ("EconomyPlugin", "@pshkv/bridge-economy"),
]
by = 146
for t, pkg in bridges:
    p += k.card(310, by, 218, 58, t, [pkg], accent="brand", title_mono=True)
    by += 68

# agents → bridges
p += k.link("M232 181 L286 200")
p += k.link("M232 267 L286 300")
p += k.link("M232 353 L286 470")

# ── gateway ──────────────────────────────────────────────────────────────
gx, gy, gw, gh = 610, 300, 300, 150
p += [f'  <rect x="{gx}" y="{gy}" width="{gw}" height="{gh}" rx="18"'
      ' class="card" stroke-width="2.4" stroke="var(--brand)"/>',
      f'  <rect x="{gx}" y="{gy}" width="{gw}" height="{gh}" rx="18"'
      ' fill="var(--brand)" fill-opacity="var(--wash)" stroke="none"/>',
      f'  <text class="bt mono" x="{gx + gw/2}" y="{gy + 38}"'
      ' text-anchor="middle" font-size="16" fill="var(--brand)">'
      'PolicyGateway.intercept()</text>',
      f'  <text class="bd" x="{gx + gw/2}" y="{gy + 60}"'
      ' text-anchor="middle">@pshkv/gate-policy-gateway</text>',
      f'  <text class="bt" x="{gx + gw/2}" y="{gy + 88}"'
      ' text-anchor="middle">the single choke point</text>',
      f'  <text class="bd" x="{gx + gw/2}" y="{gy + 110}"'
      ' text-anchor="middle">validate · authorize · tier · constrain</text>',
      f'  <text class="bd" x="{gx + gw/2}" y="{gy + 126}"'
      ' text-anchor="middle">allow · deny · escalate · transform</text>']

# bridges → gateway (funnel)
for i in range(7):
    ys = 175 + i * 68
    p += k.link(f"M528 {ys} C575 {ys} 565 375 {gx - 2} 375")

# ── authority inputs ─────────────────────────────────────────────────────
p += k.pane(610, 110, 300, 152, "Authority inputs")
p += k.card(630, 146, 260, 50, "Capability tokens",
            ["@pshkv/gate-capability-tokens"], accent="t1")
p += k.card(630, 204, 260, 46, "Rate limits · revocation",
            ["@pshkv/persistence"], accent="t1")
p += k.hline(760, 250, 760, gy - 2)

# ── human reviewer ───────────────────────────────────────────────────────
p += k.card(1038, 540, 246, 82, "Human reviewer",
            ["ApprovalQueue — T2 fallback deny,",
             "T3 fallback safe-stop, 30 s timeout"], accent="t2")
p += k.link(f"M{gx + gw} 420 C990 420 980 575 1036 575")
p += ['  <text class="edge" x="922" y="546">escalate T2 / T3</text>']

# ── world ────────────────────────────────────────────────────────────────
world = [
    ("MCP servers", ["filesystem · exec · database"]),
    ("ROS 2 graph", ["topics · services · actions"]),
    ("Actuators", ["drones · PLCs · IoT · robots"]),
]
wy = 150
for t, b in world:
    p += k.card(1058, wy, 206, 62, t, b, accent="t0")
    wy += 86
p += k.link(f"M{gx + gw} 340 C980 340 985 181 1056 181", "allow / transform",
            1000, 258)
p += k.hline(gx + gw, 352, 1056, 267)
p += k.hline(gx + gw, 364, 1056, 353)

# deny
p += k.link(f"M{gx + gw} 428 L978 456", marker="x")
p += ['  <text class="edge" x="986" y="454" fill="var(--t3)">deny — the call</text>',
      '  <text class="edge" x="986" y="469" fill="var(--t3)">never reaches the world</text>']

# ── ledger ───────────────────────────────────────────────────────────────
p += k.card(610, 530, 300, 108, "EvidenceLedger",
            ["@pshkv/gate-evidence-ledger",
             "SHA-256 hash-chained, append-only.",
             "policy.evaluated for every decision;",
             "approval.* and safety.* alongside it."],
            accent="violet")
p += k.hline(760, gy + gh, 760, 528)
p += ['  <text class="edge" x="770" y="498">every decision appended</text>']
p += k.link("M1036 598 L912 598")
p += ['  <text class="edge" x="974" y="616" text-anchor="middle">'
      'approval.granted / denied</text>']

p += k.foot(W, H, [
    "Derived from: packages/policy-gateway/src/gateway.ts · "
    "packages/bridge-*/src/*-interceptor.ts · "
    "packages/evidence-ledger/src/writer.ts · CLAUDE.md",
])
k.write("../svg/01-system-context.svg", p)
