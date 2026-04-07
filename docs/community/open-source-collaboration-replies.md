# Open-Source Collaboration Reply Playbook

Use these replies in GitHub issues/PRs to keep collaboration high-trust and solution-focused.

## Principles

- Lead with shared problem-solving, not product positioning.
- Offer concrete help (fixture, patch, adapter, test), then ask for alignment.
- Keep CTAs light: "open to a small joint fixture?" instead of "please adopt SINT".

## Maintainer Reply Templates

## 1) Robotics safety thread

```text
Great callout. We’re seeing the same failure mode around runtime safety boundaries.

Happy to collaborate on a tiny reproducible fixture in your repo first (no lock-in): one risky command path, one approval boundary, one evidence artifact.

If useful, we can open a PR that adds the fixture + docs and keep it protocol-neutral so others can reuse it.
```

## 2) Agent identity / delegated authority thread

```text
Strong point on identity semantics. We’re working on delegated authority and revocation behavior that sits alongside MCP/A2A rather than replacing either.

Would you be open to a shared test case for: delegated call -> approval tier decision -> evidence receipt? We can contribute the fixture skeleton and adapt to your model.
```

## 3) IoT / industrial interop thread

```text
Thanks for raising the OT angle. Interop is where teams get blocked fastest.

We can help with an equivalence fixture across paths (for example ROS2 vs Sparkplug/OPC UA) so policy and evidence behavior stays consistent regardless of transport.

If you want, we’ll draft the first fixture and iterate in your issue.
```

## 4) Security vulnerability thread

```text
Appreciate this report. We agree this needs fail-closed behavior and better operator visibility.

If you share your minimal repro steps, we can contribute a conformance test and propose a patch path with rollback notes so maintainers can merge safely.
```

## 5) New contributor first contact

```text
Thanks for jumping in. If you want a quick win, pick one item from our good-first board and we’ll pair async on scope/review so your first PR lands fast.

Starter board: docs/community/good-first-issues-board.md
Onboarding guide: docs/community/external-contributor-onboarding.md
```

## CTA Patterns (Low Pressure)

- "Open to a joint fixture PR?"
- "Want us to draft the first adapter/test and iterate with you?"
- "Should we contribute this as protocol-neutral reference coverage?"
- "If helpful, we can start with docs + test only, no runtime changes."

## Anti-Patterns to Avoid

- Do not imply exclusivity or replacement of existing standards.
- Do not ask maintainers to adopt a new stack before solving their immediate issue.
- Do not post "marketing" replies without runnable artifact links.
