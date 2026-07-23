# SINT Protocol — arXiv Whitepaper Bundle

Bundle for the academic paper *SINT Protocol: A Capability-Based Runtime Authorization and Evidence Framework for LLM-Driven Physical AI*, generated 2026-05-25 from the current state of `sint-protocol` main (commit `79d3b91`).

## Contents

| File | Purpose |
|---|---|
| `SINT_PROTOCOL_ARXIV_2026.md` | Full paper draft — 16,657 words, 11 sections + 4 appendices. Markdown source. |
| `references.bib` | 45 BibTeX entries (IEEE format), 1:1 matched to in-text citations. |
| `PEER_REVIEW_REPORT.md` | Round-1 simulated 5-dimension peer review (4.05/5 weighted score). |
| `figures/` | Figure assets (currently empty — diagrams are ASCII inline; generate publication figures via `visualization_agent` if needed). |

## Structure

1. **Introduction** — physical-AI transition, three gaps (authorization, drift visibility, static envelope), contributions C1-C6
2. **Background and Threat Model** — four empirical anchors (ROSClaw, MCP, SROS2, Unitree); trust boundaries; adversary model
3. **Design Principles and Architecture** — 8 principles, system diagram, 12-state DFA, monorepo structure
4. **Core Primitives** — `SintRequest`, `PolicyDecision`, capability token, resource URI scheme, 4-tier system
5. **Safety Mechanisms** — CSML, DynamicEnvelopePlugin, forbidden-combos, GoalHijack/Memory/SupplyChain/CircuitBreaker plugins, SwarmCoordinator
6. **Implementation** — 49 packages, evidence ledger, 15 bridges (selected), economic layer, operator interface, production hardening
7. **Evaluation** — latency, 1,728 tests, OWASP ASI 10/10, 6 deployment profiles, IEC 62443 / EU AI Act / NIST AI RMF crosswalks, bridge coverage
8. **Five-Year Research Roadmap (2026–2031)** — 7 research thrusts, year-by-year calendar, planned publications map, 10 key open questions
9. **Discussion and Limitations** — L1-L5 technical + E1-E3 ethical
10. **Related Work** — capability security, safety shields, robot standards, agentic AI security, LLM robotics
11. **Conclusion**
- Acknowledgments, AI Disclosure, Funding, CRediT, Data Availability, Ethics, Limitations Summary
- References (45 entries)
- Appendix A — Formal Invariants and DFA
- Appendix B — Environment Variable Reference
- Appendix C — Package Dependency Graph
- Appendix D — Compliance Mapping (Consolidated)

## Reproducing the Evaluation

```bash
# From repo root
pnpm install
pnpm run build
pnpm run test     # ~1,728 tests should pass
pnpm run bench    # PolicyGateway latency: p99 ≈ 5.1 ms steady-state
```

## Format Conversion

This is a Markdown source. To produce LaTeX or PDF:

```bash
# Markdown → LaTeX (via Pandoc)
pandoc SINT_PROTOCOL_ARXIV_2026.md -o sint-paper.tex --bibliography=references.bib --citeproc

# Markdown → PDF (via Pandoc + LaTeX)
pandoc SINT_PROTOCOL_ARXIV_2026.md -o sint-paper.pdf --bibliography=references.bib --citeproc \
       --pdf-engine=xelatex \
       -V geometry:margin=1in -V documentclass:article -V papersize:letter
```

For an arXiv submission shell, see `docs/SPAI_2026_SUBMISSION.tex` in the repo root as a starting template (IEEE conference style).

## Recommended Next Actions

| Priority | Action | Owner |
|---|---|---|
| P0 | Read paper end-to-end; mark substantive disagreements | Author |
| P1 | Add quantitative figures (CSML trajectory plot, latency CDF, ASI coverage heatmap) | `visualization_agent` or manual |
| P1 | Verify Q3 2026 warehouse AMR pilot plan (Clearpath Jackal + UR5e) is on schedule | Author |
| P2 | Submit to arXiv cs.CR + cs.RO cross-list | Author |
| P2 | Forward to IROS 2026 (August deadline) and IEEE RA-L per §8 roadmap | Author |
| P3 | Begin TLA+ specification (R7.1) for 2028 formal-methods track | Author + collaborator |

## Suggested Citation

```bibtex
@misc{sint-arxiv-2026,
  author       = {Pashkov, Illia},
  title        = {{SINT} Protocol: A Capability-Based Runtime Authorization and Evidence Framework for {LLM}-Driven Physical {AI}},
  year         = {2026},
  howpublished = {arXiv preprint},
  note         = {SINT AI Lab / PSHKV Inc.}
}
```

---

*Generated 2026-05-25 via `/ars-plan` → `academic-paper full` pipeline. Substantive authorship remains with Illia Pashkov; AI assistance covered in §AI Disclosure Statement.*
