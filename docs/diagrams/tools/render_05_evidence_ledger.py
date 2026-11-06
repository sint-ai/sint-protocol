import svgkit as k

W, H = 1340, 592
p = k.head(W, H, "SINT Protocol — the evidence ledger",
           "append() is the only write. Each event carries the hash of the "
           "one before it, so a later edit cannot hide.")

EVENTS = [
    ("GENESIS", "", "slate",
     ["previousHash", "0000…0000", "", "the chain starts", "from a fixed",
      "64-zero digest"]),
    ("seq 1", "request.received", "t1",
     ["eventId   UUIDv7", "timestamp ISO-8601 µs", "agentId   Ed25519 key",
      "tokenId   UUIDv7", "payload   {…}", "previousHash  GENESIS"]),
    ("seq 2", "policy.evaluated", "brand",
     ["payload   decision: escalate", "          tier: T2_act",
      "          risk: T2_stateful", "", "previousHash  hash(seq 1)"]),
    ("seq 3", "approval.granted", "t2",
     ["payload   reviewer, quorum", "", "previousHash  hash(seq 2)"]),
    ("seq 4", "action.completed", "t0",
     ["payload   outcome", "", "previousHash  hash(seq 3)"]),
]

x, y, cw, ch = 46, 136, 232, 232
for i, (seq, etype, acc, lines) in enumerate(EVENTS):
    cx = x + i * (cw + 24)
    p += [f'  <rect x="{cx}" y="{y}" width="{cw}" height="{ch}" rx="12"'
          ' class="card" stroke-width="1.5"/>',
          f'  <rect x="{cx}" y="{y}" width="{cw}" height="{ch}" rx="12"'
          f' fill="var(--{acc})" fill-opacity="var(--wash)" stroke="none"/>',
          f'  <text class="bt mono" x="{cx + 16}" y="{y + 28}" font-size="14"'
          f' fill="var(--{acc})">{seq}</text>']
    if etype:
        p += [f'  <text class="bd mono" x="{cx + 16}" y="{y + 47}">{etype}'
              '</text>']
    p += [f'  <line x1="{cx + 16}" y1="{y + 60}" x2="{cx + cw - 16}"'
          f' y2="{y + 60}" stroke="var(--line)" stroke-width="1"/>']
    ly = y + 82
    for ln in lines:
        p += [f'  <text class="bd mono" x="{cx + 16}" y="{ly}"'
              ' font-size="10.5">' + ln.replace("  ", "&#160;&#160;")
              + '</text>']
        ly += 17
    # hash footer
    p += [f'  <rect x="{cx}" y="{y + ch - 36}" width="{cw}" height="36"'
          f' rx="0" fill="var(--{acc})" fill-opacity="0.14" stroke="none"/>',
          f'  <text class="bd mono" x="{cx + 16}" y="{y + ch - 14}"'
          f' font-size="10.5" fill="var(--{acc})">'
          'hash = SHA-256(event)</text>']
    if i < len(EVENTS) - 1:
        p += k.link(f"M{cx + cw + 2} {y + ch - 20} H{cx + cw + 20}")
        p += [f'  <text class="edge" x="{cx + cw + 12}" y="{y + ch - 28}"'
              ' text-anchor="middle" font-size="9.5">feeds</text>']

ry = y + ch + 40
cards = [
    ("One write operation",
     ["append() is the only mutation the writer exposes.",
      "No update. No delete. In production the same shape",
      "backs onto PostgreSQL rows with immutable constraints."], "brand"),
    ("What the hash covers",
     ["eventId, sequenceNumber, timestamp, eventType, agentId,",
      "tokenId, payload and previousHash — serialised with",
      "canonicalJsonStringify() so the digest is stable."], "t1"),
    ("Tamper evidence",
     ["Change any past event and every later hash stops matching.",
      "verifyChain() returns err(sequenceNumber) at the first break;",
      "LedgerWriter.restore() resumes only a chain that verifies."],
     "t3"),
]
cx = 46
for title, lines, acc in cards:
    p += k.card(cx, ry, 404, 112, title, lines, accent=acc)
    cx += 422

p += k.foot(W, H, [
    "Derived from: packages/evidence-ledger/src/writer.ts "
    "(GENESIS_HASH L30, computeEventHash L35, append L113, restore, "
    "verifyChain) · packages/core/src/types/evidence.ts (SintEventType)",
])
k.write("../svg/05-evidence-ledger.svg", p)
