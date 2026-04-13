# SINT Protocol — Community Targets

This document maps SINT's strongest developer audiences to the right hook, asset, and call to action.

The goal is not generic awareness. The goal is to reach people who already feel the execution-governance problem and can become contributors, design partners, or early adopters.

## 1. MCP Community

**Why it matters**

MCP developers already understand tool exposure, client trust, and the risk of powerful servers in production. They are one of the closest audiences to SINT's immediate adoption path.

**Best hook**

"What governs an MCP tool call after the model decides to use it?"

**Asset to lead with**

- `npx sint-scan`
- MCP proxy bridge example
- [docs/guides/secure-mcp-deployments.md](docs/guides/secure-mcp-deployments.md)

**Call to action**

Ask for feedback on real production governance gaps in MCP deployments and invite maintainers to test their own servers against SINT's approval-tier model.

## 2. Robotics and Open Robotics Communities

**Why it matters**

These teams care about safety, operator escalation, and physical constraints. They do not need to be convinced that bad commands can have real consequences.

**Best hook**

"What should sit between an AI-generated command and a robot action?"

**Asset to lead with**

- ROS 2 bridge material
- warehouse and industrial examples
- compliance and safety docs

**Call to action**

Invite discussion around where runtime authorization ends and traditional robot safety controllers begin, and where SINT adds complementary value.

## 3. Agent Framework Communities

**Why it matters**

LangGraph, AutoGen, Semantic Kernel, and similar communities are full of developers building increasingly capable agent workflows. Many now need a reusable control plane for execution, not just orchestration.

**Best hook**

"Keep your framework. Add a governance layer for execution."

**Asset to lead with**

- README architecture diagram
- [docs/getting-started.md](docs/getting-started.md)
- [docs/PITCH.md](docs/PITCH.md)

**Call to action**

Start discussions around how framework-native agents should express authority, approval, and evidence when their actions become costly or irreversible.

## 4. Security and Standards Communities

**Why it matters**

OWASP ASI, AI security researchers, and standards-oriented practitioners care about enforceable controls, evidence, and system boundaries more than surface-level agent demos.

**Best hook**

"SINT is an execution-governance layer for agent systems, with protocol-level enforcement rather than post-hoc logging."

**Asset to lead with**

- threat model
- OWASP ASI mapping
- NIST and EU AI Act alignment docs

**Call to action**

Ask reviewers to critique the trust boundary, approval-tier system, token design, and evidence model, not just the implementation.

## 5. Broad Open-Source Developer Channels

**Why it matters**

Hacker News, r/MachineLearning, r/LocalLLaMA, Hugging Face, and similar communities can drive the most traffic, but only if the framing is technical, concrete, and honest.

**Best hook**

"We built an open protocol for governing agent execution across MCP, robotics, and safety-critical systems."

**Asset to lead with**

- README
- [docs/social/show-hn-draft.md](docs/social/show-hn-draft.md)
- [docs/social/twitter-launch-thread.md](docs/social/twitter-launch-thread.md)
- [docs/social/linkedin-launch-post.md](docs/social/linkedin-launch-post.md)

**Call to action**

Point readers to the repo, docs, quick start, and discussions. Ask what would make them trust an agent execution layer in production.

## Summary

| Community | Primary angle | Best CTA |
|---|---|---|
| MCP | Governance for tool calls | Try `sint-scan`, share gaps |
| Robotics | Authorization before physical action | Review bridge and safety model |
| Agent frameworks | Keep your stack, add execution governance | Discuss integration patterns |
| Security and standards | Protocol-level controls and evidence | Critique trust boundaries |
| Broad OSS channels | Open protocol with concrete developer workflow | Visit repo, docs, and discussions |
