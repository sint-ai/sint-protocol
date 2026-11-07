"""Tiny SVG layout helpers shared by the SINT diagram renderers.

Every diagram is a self-contained SVG with no external fonts and no raster
assets. Colours come from CSS custom properties that flip on
`prefers-color-scheme`, so one file reads correctly on a light or a dark page.
When a renderer ignores the media query the light palette applies and the
explicit surface rect keeps the text legible.
"""

from html import escape

FONT = ('ui-sans-serif,-apple-system,"Segoe UI",Inter,Roboto,'
        '"Helvetica Neue",Arial,sans-serif')
MONO = ('ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,'
        '"Liberation Mono",monospace')

# Tier / accent ramp. Chosen for legibility against both surfaces.
ACCENTS = {
    "brand": ("#0f766e", "#5eead4"),
    "t0":    ("#0d9488", "#5eead4"),
    "t1":    ("#0369a1", "#7dd3fc"),
    "t2":    ("#b45309", "#fbbf24"),
    "t3":    ("#b91c1c", "#fca5a5"),
    "violet":("#6d28d9", "#c4b5fd"),
    "slate": ("#475569", "#94a3b8"),
}


def style_block() -> str:
    accent_light = "\n".join(
        f"    --{k}:{v[0]};" for k, v in ACCENTS.items())
    accent_dark = "\n".join(
        f"      --{k}:{v[1]};" for k, v in ACCENTS.items())
    return f"""  <style>
    :root {{
      --bg:#f7f9fc; --surface:#ffffff; --surface2:#f1f5f9;
      --line:#cbd5e1; --line-soft:#e2e8f0;
      --ink:#0f172a; --mute:#44546a; --faint:#64748b;
{accent_light}
      --wash:0.10;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg:#0a0e17; --surface:#121a28; --surface2:#0f1623;
        --line:#2f3f55; --line-soft:#1e293b;
        --ink:#e8edf5; --mute:#a8b6c8; --faint:#7d8da3;
{accent_dark}
        --wash:0.16;
      }}
    }}
    .bg {{ fill: var(--bg); }}
    text {{ font-family: {FONT}; fill: var(--ink); }}
    .mono {{ font-family: {MONO}; }}
    .h1 {{ font-size: 25px; font-weight: 700; letter-spacing: -0.2px; }}
    .sub {{ font-size: 13.5px; fill: var(--mute); }}
    .grp {{ font-size: 11.5px; font-weight: 700; fill: var(--faint);
            letter-spacing: 1.2px; text-transform: uppercase; }}
    .bt {{ font-size: 13.5px; font-weight: 650; }}
    .bd {{ font-size: 11.5px; fill: var(--mute); }}
    .edge {{ font-size: 11px; fill: var(--faint); }}
    .card {{ fill: var(--surface); stroke: var(--line); stroke-width: 1.2; }}
    .pane {{ fill: var(--surface2); stroke: var(--line-soft);
             stroke-width: 1.2; }}
    .link {{ fill: none; stroke: var(--line); stroke-width: 1.6;
             stroke-linecap: round; }}
    .link.soft {{ stroke-dasharray: 5 5; }}
    .foot {{ font-size: 11px; fill: var(--faint); }}
  </style>"""


def head(w: int, h: int, title: str, subtitle: str = "") -> list:
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'role="img" aria-label="{escape(title)}">',
        f'  <title>{escape(title)}</title>',
        style_block(),
        '  <defs>',
        '    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5"'
        ' markerWidth="7" markerHeight="7" orient="auto-start-reverse">',
        '      <path d="M0 0 L10 5 L0 10 z" fill="var(--line)"/>',
        '    </marker>',
        '    <marker id="x" viewBox="0 0 10 10" refX="5" refY="5"'
        ' markerWidth="8" markerHeight="8" orient="auto">',
        '      <path d="M2 2 L8 8 M8 2 L2 8" stroke="var(--t3)"'
        ' stroke-width="1.8" fill="none"/>',
        '    </marker>',
        '  </defs>',
        f'  <rect class="bg" width="{w}" height="{h}"/>',
        f'  <text class="h1" x="40" y="48">{escape(title)}</text>',
    ]
    if subtitle:
        out.append(f'  <text class="sub" x="40" y="71">{escape(subtitle)}</text>')
    return out


def foot(w: int, h: int, lines) -> list:
    """Source attribution, wrapped to the canvas width."""
    budget = int((w - 80) / 5.35)
    wrapped = []
    for raw in lines:
        line = ""
        for word in raw.split(" "):
            if line and len(line) + 1 + len(word) > budget:
                wrapped.append(line)
                line = word
            else:
                line = (line + " " + word).strip()
        if line:
            wrapped.append(line)
    out = []
    y = h - 14 - 15 * (len(wrapped) - 1)
    for ln in wrapped:
        out.append(f'  <text class="foot" x="40" y="{y}">{escape(ln)}</text>')
        y += 15
    return out


def pane(x, y, w, h, label="", r=14) -> list:
    out = [f'  <rect class="pane" x="{x}" y="{y}" width="{w}" height="{h}"'
           f' rx="{r}"/>']
    if label:
        out.append(f'  <text class="grp" x="{x + 16}" y="{y + 22}">'
                   f'{escape(label)}</text>')
    return out


def card(x, y, w, h, title, body=(), accent="slate", mono_body=False,
         r=10, title_mono=False, wash=True, align="left") -> list:
    """A titled card. `body` is a list of already-wrapped lines."""
    out = []
    fill = (f' fill="var(--{accent})" fill-opacity="var(--wash)"'
            if wash else '')
    out.append(f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}"'
               f' class="card"/>')
    if wash:
        out.append(f'  <rect x="{x}" y="{y}" width="{w}" height="{h}"'
                   f' rx="{r}" stroke="none"{fill}/>')
    out.append(f'  <rect x="{x}" y="{y + 1}" width="4" height="{h - 2}"'
               f' rx="2" fill="var(--{accent})"/>')
    if align == "center":
        tx, anchor = x + w / 2, ' text-anchor="middle"'
    else:
        tx, anchor = x + 16, ''
    ty = y + 22 if body else y + h / 2 + 5
    tcls = "bt mono" if title_mono else "bt"
    out.append(f'  <text class="{tcls}" x="{tx:g}" y="{ty:g}"{anchor}'
               f' fill="var(--{accent})">{escape(title)}</text>')
    by = ty + 19
    for ln in body:
        cls = "bd mono" if mono_body else "bd"
        out.append(f'  <text class="{cls}" x="{tx:g}" y="{by:g}"{anchor}>'
                   f'{escape(ln)}</text>')
        by += 15
    return out


def link(path, label="", lx=None, ly=None, soft=False, marker="a",
         label_anchor="middle") -> list:
    cls = "link soft" if soft else "link"
    stroke = ' stroke="var(--t3)"' if marker == "x" else ''
    out = [f'  <path class="{cls}" d="{path}"'
           f' marker-end="url(#{marker})"{stroke}/>']
    if label:
        out.append(f'  <text class="edge" x="{lx:g}" y="{ly:g}"'
                   f' text-anchor="{label_anchor}">{escape(label)}</text>')
    return out


def hline(x1, y1, x2, y2, **kw) -> list:
    return link(f"M{x1} {y1} L{x2} {y2}", **kw)


def elbow(x1, y1, x2, y2, bend=None, **kw) -> list:
    """Horizontal-then-vertical-then-horizontal connector."""
    bx = bend if bend is not None else (x1 + x2) / 2
    return link(f"M{x1} {y1} H{bx:g} V{y2:g} H{x2}", **kw)


def write(path, parts):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(parts) + "\n</svg>\n")
    print("wrote", path)
