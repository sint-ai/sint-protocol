"""
SINT Protocol — MCPScanner.

Python port of the ``@sint/bridge-mcp`` MCP scanner CLI.

Classifies MCP tool definitions into SINT approval tiers using the same
keyword and annotation logic as the TypeScript ``mcp-resource-mapper.ts``.

CLI usage::

    sint-scan --server my-server tool1 tool2 ...
    sint-scan --server my-server --json tool1 tool2 ...
    sint-scan --file tools.json

Programmatic usage::

    from sint.scanner import scan_tool, scan_server

    result = scan_tool("filesystem", "bash", "Run a bash command")
    print(result.tier)        # ApprovalTier.T3_COMMIT
    print(result.risk_label)  # "CRITICAL"

    report = scan_server("my-server", [
        {"name": "readFile", "description": "Read a file"},
        {"name": "bash", "description": "Execute bash"},
    ])
    print(report.by_risk)
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from typing import Any

from .types import ApprovalTier

# ---------------------------------------------------------------------------
# Keyword lists — mirrors mcp-resource-mapper.ts
# ---------------------------------------------------------------------------

# ASI05: shell / code execution keywords → T3_COMMIT
_SHELL_EXEC_KEYWORDS: frozenset[str] = frozenset(
    [
        "execute",
        "exec",
        "shell",
        "bash",
        "sh",
        "cmd",
        "powershell",
        "run_command",
        "system",
        "eval",
        "subprocess",
    ]
)

# Known shell-server name fragments → T3_COMMIT
_SHELL_SERVER_NAMES: frozenset[str] = frozenset(
    ["shell", "terminal", "bash", "exec", "code-interpreter"]
)

# Description / name keywords that bump tier up to T2_ACT (HIGH)
_HIGH_RISK_KEYWORDS: frozenset[str] = frozenset(
    [
        "delete",
        "remove",
        "drop",
        "truncate",
        "destroy",
        "overwrite",
        "format",
        "wipe",
        "kill",
        "terminate",
        "stop",
        "disable",
        "revoke",
    ]
)

# Description / name keywords that keep tier at T1_PREPARE (MEDIUM)
_MEDIUM_RISK_KEYWORDS: frozenset[str] = frozenset(
    [
        "write",
        "create",
        "insert",
        "update",
        "upload",
        "modify",
        "patch",
        "set",
        "put",
        "send",
        "post",
        "publish",
        "push",
    ]
)

# Read-only keywords → T0_OBSERVE (LOW)
_LOW_RISK_KEYWORDS: frozenset[str] = frozenset(
    [
        "read",
        "get",
        "list",
        "query",
        "search",
        "fetch",
        "load",
        "view",
        "describe",
        "info",
        "stat",
        "check",
        "inspect",
        "watch",
        "subscribe",
        "observe",
        "monitor",
    ]
)

# Tier → human-readable risk label (matching TypeScript CLI output)
_TIER_LABELS: dict[ApprovalTier, str] = {
    ApprovalTier.T0_OBSERVE: "LOW",
    ApprovalTier.T1_PREPARE: "MEDIUM",
    ApprovalTier.T2_ACT: "HIGH",
    ApprovalTier.T3_COMMIT: "CRITICAL",
}

# ANSI color codes
_COLORS: dict[str, str] = {
    "reset": "\033[0m",
    "bold": "\033[1m",
    "green": "\033[32m",
    "yellow": "\033[33m",
    "red": "\033[31m",
    "bright_red": "\033[91m",
    "cyan": "\033[36m",
    "grey": "\033[90m",
}

# Tier → color name
_TIER_COLORS: dict[ApprovalTier, str] = {
    ApprovalTier.T0_OBSERVE: "green",
    ApprovalTier.T1_PREPARE: "yellow",
    ApprovalTier.T2_ACT: "red",
    ApprovalTier.T3_COMMIT: "bright_red",
}


def _colorize(text: str, color: str, *, no_color: bool = False) -> str:
    if no_color or not sys.stdout.isatty():
        return text
    code = _COLORS.get(color, "")
    return f"{code}{text}{_COLORS['reset']}"


# ---------------------------------------------------------------------------
# Annotation-based classification (mirrors tierFromAnnotations in TS)
# ---------------------------------------------------------------------------


class MCPToolAnnotations:
    """Subset of MCP tool annotations used for tier classification."""

    def __init__(
        self,
        read_only_hint: bool | None = None,
        destructive_hint: bool | None = None,
        open_world_hint: bool | None = None,
    ) -> None:
        self.read_only_hint = read_only_hint
        self.destructive_hint = destructive_hint
        self.open_world_hint = open_world_hint


def _tier_from_annotations(annotations: MCPToolAnnotations) -> ApprovalTier | None:
    if annotations.read_only_hint is True:
        return ApprovalTier.T0_OBSERVE
    if annotations.destructive_hint is True:
        return ApprovalTier.T3_COMMIT
    if annotations.open_world_hint is True:
        return ApprovalTier.T1_PREPARE
    return None


# ---------------------------------------------------------------------------
# Keyword-based classification
# ---------------------------------------------------------------------------


def _classify_by_keywords(tool_name: str, server_id: str, description: str) -> ApprovalTier:
    """Classify a tool tier from name/server/description keywords.

    Priority (highest to lowest):
      1. Shell/exec keywords in name or server → T3_COMMIT
      2. High-risk keywords in name or description → T2_ACT
      3. Medium-risk keywords in name → T1_PREPARE
      4. Read-only keywords in name → T0_OBSERVE
      5. Default → T1_PREPARE
    """
    name_lower = tool_name.lower()
    server_lower = server_id.lower()
    desc_lower = description.lower()

    # 1. Shell / exec → CRITICAL
    if any(kw == name_lower or name_lower in kw or kw in name_lower for kw in _SHELL_EXEC_KEYWORDS):
        return ApprovalTier.T3_COMMIT
    if any(s in server_lower for s in _SHELL_SERVER_NAMES):
        return ApprovalTier.T3_COMMIT

    # 2. High-risk words in name or description → HIGH
    combined = f"{name_lower} {desc_lower}"
    if any(kw in combined for kw in _HIGH_RISK_KEYWORDS):
        return ApprovalTier.T2_ACT

    # 3. Medium-risk words in name → MEDIUM
    if any(kw in name_lower for kw in _MEDIUM_RISK_KEYWORDS):
        return ApprovalTier.T1_PREPARE

    # 4. Read-only words in name → LOW
    if any(kw in name_lower for kw in _LOW_RISK_KEYWORDS):
        return ApprovalTier.T0_OBSERVE

    # 5. Default
    return ApprovalTier.T1_PREPARE


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@dataclass
class ToolScanResult:
    """Classification result for a single MCP tool."""

    server_id: str
    tool_name: str
    description: str
    tier: ApprovalTier
    risk_label: str  # LOW | MEDIUM | HIGH | CRITICAL
    classification_reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "serverId": self.server_id,
            "toolName": self.tool_name,
            "description": self.description,
            "tier": self.tier.value,
            "riskLabel": self.risk_label,
            "classificationReason": self.classification_reason,
        }

    def format_line(self, *, no_color: bool = False) -> str:
        color = _TIER_COLORS.get(self.tier, "reset")
        label = _colorize(f"[{self.risk_label}]", color, no_color=no_color)
        tier_str = _colorize(self.tier.value, color, no_color=no_color)
        tool = _colorize(f"{self.server_id}/{self.tool_name}", "bold", no_color=no_color)
        return f"  {label} {tool}  {tier_str}  — {self.classification_reason}"


@dataclass
class ServerScanReport:
    """Aggregated scan report for an MCP server."""

    server_id: str
    tools: list[ToolScanResult] = field(default_factory=list)

    @property
    def by_risk(self) -> dict[str, int]:
        """Count of tools per risk label."""
        counts: dict[str, int] = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
        for t in self.tools:
            counts[t.risk_label] = counts.get(t.risk_label, 0) + 1
        return counts

    @property
    def has_critical(self) -> bool:
        return any(t.tier == ApprovalTier.T3_COMMIT for t in self.tools)

    @property
    def has_high(self) -> bool:
        return any(t.tier == ApprovalTier.T2_ACT for t in self.tools)

    def suggested_exit_code(self) -> int:
        """Exit 2 on CRITICAL tools, 1 on HIGH, 0 otherwise.

        Matches the TypeScript CLI convention for use in CI pipelines.
        """
        if self.has_critical:
            return 2
        if self.has_high:
            return 1
        return 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "serverId": self.server_id,
            "tools": [t.to_dict() for t in self.tools],
            "byRisk": self.by_risk,
            "hasCritical": self.has_critical,
            "hasHigh": self.has_high,
            "suggestedExitCode": self.suggested_exit_code(),
        }

    def format_report(self, *, no_color: bool = False) -> str:
        lines: list[str] = []
        bold = lambda s: _colorize(s, "bold", no_color=no_color)  # noqa: E731
        cyan = lambda s: _colorize(s, "cyan", no_color=no_color)  # noqa: E731

        lines.append(bold(f"\nSINT MCP Scanner — {self.server_id}"))
        lines.append(cyan(f"  {len(self.tools)} tool(s) scanned\n"))

        for tool in self.tools:
            lines.append(tool.format_line(no_color=no_color))

        lines.append("")
        by_risk = self.by_risk
        summary_parts = []
        for label, color in [("CRITICAL", "bright_red"), ("HIGH", "red"), ("MEDIUM", "yellow"), ("LOW", "green")]:
            count = by_risk.get(label, 0)
            if count:
                summary_parts.append(_colorize(f"{count} {label}", color, no_color=no_color))
        lines.append(bold("  Summary: ") + "  ".join(summary_parts))
        lines.append("")
        return "\n".join(lines)


def scan_tool(
    server_id: str,
    tool_name: str,
    description: str = "",
    annotations: MCPToolAnnotations | None = None,
) -> ToolScanResult:
    """Classify a single MCP tool into a SINT approval tier.

    Parameters
    ----------
    server_id:
        MCP server identifier (e.g. ``"filesystem"``).
    tool_name:
        Tool name as advertised by the server (e.g. ``"readFile"``).
    description:
        Optional tool description — used for keyword matching.
    annotations:
        Optional :class:`MCPToolAnnotations` (MCP spec §tool-annotations).
        Annotations take precedence over keyword classification.

    Returns
    -------
    ToolScanResult
    """
    # 1. Annotation-based classification (highest precedence)
    if annotations:
        tier = _tier_from_annotations(annotations)
        if tier is not None:
            reason = "annotation"
            return ToolScanResult(
                server_id=server_id,
                tool_name=tool_name,
                description=description,
                tier=tier,
                risk_label=_TIER_LABELS[tier],
                classification_reason=reason,
            )

    # 2. Keyword-based classification
    tier = _classify_by_keywords(tool_name, server_id, description)
    reason = _classification_reason(tool_name, server_id, description, tier)

    return ToolScanResult(
        server_id=server_id,
        tool_name=tool_name,
        description=description,
        tier=tier,
        risk_label=_TIER_LABELS[tier],
        classification_reason=reason,
    )


def _classification_reason(tool_name: str, server_id: str, description: str, tier: ApprovalTier) -> str:
    """Human-readable explanation for why a tier was assigned."""
    name_lower = tool_name.lower()
    server_lower = server_id.lower()
    desc_lower = description.lower()

    if tier == ApprovalTier.T3_COMMIT:
        matching = [kw for kw in _SHELL_EXEC_KEYWORDS if kw in name_lower]
        if matching:
            return f"shell/exec keyword in tool name: {matching[0]!r}"
        srv_match = [s for s in _SHELL_SERVER_NAMES if s in server_lower]
        if srv_match:
            return f"shell/exec server name: {srv_match[0]!r}"
        return "destructive/exec tool"

    if tier == ApprovalTier.T2_ACT:
        combined = f"{name_lower} {desc_lower}"
        matching = [kw for kw in _HIGH_RISK_KEYWORDS if kw in combined]
        return f"high-risk keyword: {matching[0]!r}" if matching else "high-risk tool"

    if tier == ApprovalTier.T1_PREPARE:
        matching = [kw for kw in _MEDIUM_RISK_KEYWORDS if kw in name_lower]
        return f"write keyword: {matching[0]!r}" if matching else "write/mutate tool (default)"

    # T0
    matching = [kw for kw in _LOW_RISK_KEYWORDS if kw in name_lower]
    return f"read-only keyword: {matching[0]!r}" if matching else "read-only tool"


def scan_server(
    server_id: str,
    tools: list[dict[str, Any]],
) -> ServerScanReport:
    """Scan all tools exposed by an MCP server.

    Parameters
    ----------
    server_id:
        MCP server identifier.
    tools:
        List of tool dicts with at minimum ``"name"`` (str). Optional keys:
        ``"description"`` (str), ``"annotations"`` (dict with
        ``readOnlyHint``, ``destructiveHint``, ``openWorldHint``).

    Returns
    -------
    ServerScanReport
        Aggregated report with per-tool results and by-risk counts.

    Examples
    --------
    ::

        report = scan_server("filesystem", [
            {"name": "readFile", "description": "Read a file from disk"},
            {"name": "deleteFile", "description": "Permanently delete a file"},
            {"name": "bash", "description": "Execute a shell command"},
        ])
        print(report.by_risk)
        # {'LOW': 1, 'MEDIUM': 0, 'HIGH': 1, 'CRITICAL': 1}
    """
    report = ServerScanReport(server_id=server_id)
    for tool in tools:
        name = str(tool.get("name", ""))
        desc = str(tool.get("description", ""))
        ann_raw = tool.get("annotations")
        annotations: MCPToolAnnotations | None = None
        if isinstance(ann_raw, dict):
            annotations = MCPToolAnnotations(
                read_only_hint=ann_raw.get("readOnlyHint"),
                destructive_hint=ann_raw.get("destructiveHint"),
                open_world_hint=ann_raw.get("openWorldHint"),
            )
        result = scan_tool(server_id, name, desc, annotations)
        report.tools.append(result)
    return report


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sint-scan",
        description="SINT MCP Scanner — classify MCP tool risk tiers",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  sint-scan --server filesystem readFile writeFile deleteFile bash
  sint-scan --server filesystem --json readFile writeFile
  sint-scan --file tools.json
  sint-scan --server myserver --fail-on HIGH toolA toolB

Exit codes:
  0   No HIGH or CRITICAL tools found
  1   At least one HIGH-risk tool found
  2   At least one CRITICAL-risk tool found
""",
    )
    parser.add_argument("tools", nargs="*", help="Tool names to scan")
    parser.add_argument("--server", "-s", default="unknown", help="MCP server identifier")
    parser.add_argument(
        "--file",
        "-f",
        help="JSON file with tool definitions (array of {name, description?, annotations?})",
    )
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--no-color", action="store_true", help="Disable colored output")
    parser.add_argument(
        "--fail-on",
        choices=["HIGH", "CRITICAL"],
        default=None,
        help="Exit with non-zero code if any tool is at or above this risk level",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    """CLI entry point for ``sint-scan``."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    tools: list[dict[str, Any]] = []

    if args.file:
        try:
            with open(args.file) as fh:
                tools = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            parser.error(f"Failed to load --file: {exc}")

    for name in args.tools:
        tools.append({"name": name, "description": ""})

    if not tools:
        parser.error("Provide tool names as arguments or use --file")

    report = scan_server(args.server, tools)

    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print(report.format_report(no_color=args.no_color))

    # Exit code logic
    exit_code = 0
    if args.fail_on == "CRITICAL" and report.has_critical:
        exit_code = 2
    elif args.fail_on == "HIGH" and (report.has_critical or report.has_high):
        exit_code = max(exit_code, 1)
        if report.has_critical:
            exit_code = 2
    else:
        exit_code = report.suggested_exit_code()

    sys.exit(exit_code)
