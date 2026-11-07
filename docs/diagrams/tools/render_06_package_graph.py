import svgkit as k

W, H = 1340, 836
p = k.head(W, H, "SINT Protocol — package layering",
           "Published under the @pshkv scope. The gate-* packages live in "
           "directories without the prefix — packages/policy-gateway builds "
           "@pshkv/gate-policy-gateway.")

LAYERS = [
    (136, "Foundation"),
    (252, "Authority & storage"),
    (368, "Audit"),
    (484, "Enforcement"),
    (592, "Protocol surface"),
    (702, "Edge"),
]
for ly, label in LAYERS:
    p += [f'  <text class="grp" x="46" y="{ly + 2}">{label}</text>',
          f'  <line x1="46" y1="{ly + 12}" x2="{W - 46}" y2="{ly + 12}"'
          ' stroke="var(--line-soft)" stroke-width="1"/>']

NODES = {
    "core":  (560, 150, 220, 56, "@pshkv/core",
              "types · Zod schemas · tier rules", "brand"),
    "tok":   (380, 266, 230, 56, "@pshkv/gate-capability-tokens",
              "packages/capability-tokens", "t1"),
    "per":   (640, 266, 200, 56, "@pshkv/persistence",
              "rate limits · revocation", "t1"),
    "reg":   (870, 266, 190, 56, "@pshkv/token-registry",
              "public token registry", "t1"),
    "led":   (470, 382, 230, 56, "@pshkv/gate-evidence-ledger",
              "packages/evidence-ledger", "violet"),
    "gwp":   (430, 498, 320, 62, "@pshkv/gate-policy-gateway",
              "packages/policy-gateway — intercept()", "brand"),
}
for key, (x, y, w, h, title, sub, acc) in NODES.items():
    mono = title.startswith("@")
    p += [f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="11"'
          ' class="card" stroke-width="1.5"/>',
          f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="11"'
          f' fill="var(--{acc})" fill-opacity="var(--wash)" stroke="none"/>',
          f'  <text class="bt mono" x="{x + w / 2}" y="{y + 25}"'
          f' text-anchor="middle" font-size="12.5" fill="var(--{acc})">'
          f'{title}</text>',
          f'  <text class="bd" x="{x + w / 2}" y="{y + 43}"'
          f' text-anchor="middle">{sub}</text>']

# bridges pane
bx, by, bw, bh = 80, 600, 1180, 76
p += k.pane(bx, by, bw, bh)
BRIDGES = ["bridge-mcp", "bridge-ros2", "bridge-mavlink", "bridge-iot",
           "bridge-a2a", "bridge-swarm", "bridge-economy", "bridge-opcua",
           "bridge-mqtt-sparkplug", "bridge-open-rmf", "bridge-matter",
           "bridge-homeassistant", "bridge-grpc", "bridge-openpi"]
p += [f'  <text class="grp" x="{bx + 16}" y="{by + 22}">'
      'Bridge adapters — @pshkv/bridge-* (each depends on core, tokens and '
      'the gateway; none depends on another)</text>']
cxp = bx + 16
cyp = by + 36
for i, b in enumerate(BRIDGES):
    wdt = 7.6 * len(b) + 18
    if cxp + wdt > bx + bw - 16:
        cxp, cyp = bx + 16, cyp + 26
    p += [f'  <rect x="{cxp}" y="{cyp}" width="{wdt:g}" height="24" rx="7"'
          ' fill="var(--brand)" fill-opacity="var(--wash)"'
          ' stroke="var(--line)" stroke-width="1"/>',
          f'  <text class="bd mono" x="{cxp + wdt / 2:g}" y="{cyp + 16}"'
          ' text-anchor="middle" font-size="10.5">' + b + '</text>']
    cxp += wdt + 8

# consumers
p += k.card(150, 722, 460, 58, "apps/gateway-server",
            ["Hono HTTP API — core, tokens, ledger, gateway, persistence, "
             "registry,", "memory, interface-bridge, bridge-a2a, "
             "bridge-economy, avatar"], accent="t2")
p += k.card(690, 722, 460, 58, "@pshkv/conformance-tests",
            ["Security regression suite — depends on the gateway, the "
             "ledger and",
             "every bridge it certifies. Must pass on every PR."], accent="t3")

L = k.link
p += L("M670 206 C670 230 495 236 495 264")        # core -> tokens
p += L("M700 206 V264")                            # core -> persistence
p += L("M700 206 C860 220 965 230 965 264")        # core -> registry
p += L("M495 322 V380")                            # tokens -> ledger
p += L("M620 206 C560 230 560 350 585 380")        # core -> ledger
p += L("M495 438 C495 466 560 470 575 496")        # ledger -> gateway
p += L("M430 322 C400 360 400 460 428 498", soft=True)  # tokens -> gateway
p += L("M740 322 C760 360 740 470 700 496")        # persistence -> gateway
p += L("M1010 322 C1060 420 1000 540 752 540", soft=True)  # registry -> server
p += L("M590 560 V598")                            # gateway -> bridges
p += L("M400 676 C400 700 380 700 380 720")        # bridges -> server
p += L("M900 676 C900 700 920 700 920 720")        # bridges -> conformance

p += k.foot(W, H, [
    "Derived from: the workspace dependency lists in each package.json "
    "(packages/*/package.json, apps/gateway-server/package.json). "
    "CLAUDE.md's dependency graph writes these as @sint/* — the published "
    "scope in the manifests is @pshkv/*.",
])
k.write("../svg/06-package-graph.svg", p)
