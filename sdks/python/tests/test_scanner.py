"""Tests for sint.scanner — tier classification and scan_server reporting."""

from __future__ import annotations

import json
import sys
from unittest.mock import patch

import pytest

from sint.scanner import (
    MCPToolAnnotations,
    ServerScanReport,
    ToolScanResult,
    scan_server,
    scan_tool,
)
from sint.types import ApprovalTier


# ---------------------------------------------------------------------------
# scan_tool — individual tool classification
# ---------------------------------------------------------------------------


class TestScanToolTierClassification:
    """Tier classification matching the TypeScript mcp-resource-mapper.ts logic."""

    # T3_COMMIT — CRITICAL (shell/exec keywords)
    def test_bash_is_critical(self) -> None:
        result = scan_tool("myserver", "bash", "Run a bash command")
        assert result.tier == ApprovalTier.T3_COMMIT
        assert result.risk_label == "CRITICAL"

    def test_exec_is_critical(self) -> None:
        result = scan_tool("myserver", "exec", "Execute a command")
        assert result.tier == ApprovalTier.T3_COMMIT

    def test_eval_is_critical(self) -> None:
        result = scan_tool("myserver", "eval", "Evaluate an expression")
        assert result.tier == ApprovalTier.T3_COMMIT

    def test_shell_is_critical(self) -> None:
        result = scan_tool("myserver", "shell", "Run shell command")
        assert result.tier == ApprovalTier.T3_COMMIT

    def test_run_command_is_critical(self) -> None:
        result = scan_tool("myserver", "run_command", "")
        assert result.tier == ApprovalTier.T3_COMMIT

    def test_execute_tool_is_critical(self) -> None:
        result = scan_tool("myserver", "executePlan", "Execute a robot plan")
        assert result.tier == ApprovalTier.T3_COMMIT

    def test_shell_server_name_is_critical(self) -> None:
        result = scan_tool("terminal", "run", "Run a command in terminal")
        assert result.tier == ApprovalTier.T3_COMMIT

    # T2_ACT — HIGH (destructive keywords)
    def test_delete_file_is_high(self) -> None:
        result = scan_tool("filesystem", "deleteFile", "Delete a file permanently")
        assert result.tier == ApprovalTier.T2_ACT
        assert result.risk_label == "HIGH"

    def test_remove_is_high(self) -> None:
        result = scan_tool("myserver", "removeItem", "Remove an item")
        assert result.tier == ApprovalTier.T2_ACT

    def test_drop_table_is_high(self) -> None:
        result = scan_tool("db", "dropTable", "Drop a database table")
        assert result.tier == ApprovalTier.T2_ACT

    # T1_PREPARE — MEDIUM (write keywords)
    def test_write_file_is_medium(self) -> None:
        result = scan_tool("filesystem", "writeFile", "Write content to a file")
        assert result.tier == ApprovalTier.T1_PREPARE
        assert result.risk_label == "MEDIUM"

    def test_create_dir_is_medium(self) -> None:
        result = scan_tool("filesystem", "createDirectory", "Create a new directory")
        assert result.tier == ApprovalTier.T1_PREPARE

    def test_update_record_is_medium(self) -> None:
        result = scan_tool("db", "updateRecord", "Update a database record")
        assert result.tier == ApprovalTier.T1_PREPARE

    # T0_OBSERVE — LOW (read-only keywords)
    def test_read_file_is_low(self) -> None:
        result = scan_tool("filesystem", "readFile", "Read a file from disk")
        assert result.tier == ApprovalTier.T0_OBSERVE
        assert result.risk_label == "LOW"

    def test_list_directory_is_low(self) -> None:
        result = scan_tool("filesystem", "listDirectory", "List directory contents")
        assert result.tier == ApprovalTier.T0_OBSERVE

    def test_get_info_is_low(self) -> None:
        result = scan_tool("filesystem", "getFileInfo", "Retrieve file metadata")
        assert result.tier == ApprovalTier.T0_OBSERVE

    def test_query_db_is_low(self) -> None:
        result = scan_tool("db", "queryRecords", "Query database records")
        assert result.tier == ApprovalTier.T0_OBSERVE

    # Default / unknown
    def test_unknown_tool_defaults_to_medium(self) -> None:
        result = scan_tool("myserver", "doSomething", "An unknown tool")
        assert result.tier == ApprovalTier.T1_PREPARE


# ---------------------------------------------------------------------------
# Annotation-based overrides
# ---------------------------------------------------------------------------


class TestAnnotationOverrides:
    def test_read_only_hint_forces_low(self) -> None:
        ann = MCPToolAnnotations(read_only_hint=True)
        result = scan_tool("myserver", "bash", "Run bash", annotations=ann)
        # Annotation overrides keyword — read_only_hint wins
        assert result.tier == ApprovalTier.T0_OBSERVE
        assert result.classification_reason == "annotation"

    def test_destructive_hint_forces_critical(self) -> None:
        ann = MCPToolAnnotations(destructive_hint=True)
        result = scan_tool("myserver", "readFile", "Read a file", annotations=ann)
        assert result.tier == ApprovalTier.T3_COMMIT
        assert result.classification_reason == "annotation"

    def test_open_world_hint_forces_medium(self) -> None:
        ann = MCPToolAnnotations(open_world_hint=True)
        result = scan_tool("myserver", "readFile", "", annotations=ann)
        assert result.tier == ApprovalTier.T1_PREPARE

    def test_no_annotation_falls_through_to_keywords(self) -> None:
        ann = MCPToolAnnotations()  # all None
        result = scan_tool("myserver", "bash", "", annotations=ann)
        assert result.tier == ApprovalTier.T3_COMMIT  # keyword wins


# ---------------------------------------------------------------------------
# scan_server — aggregate reporting
# ---------------------------------------------------------------------------


_MIXED_TOOLS = [
    {"name": "readFile", "description": "Read a file from disk"},
    {"name": "writeFile", "description": "Write content to a file"},
    {"name": "deleteFile", "description": "Permanently delete a file"},
    {"name": "bash", "description": "Execute a bash command"},
]


class TestScanServer:
    def test_by_risk_counts(self) -> None:
        report = scan_server("filesystem", _MIXED_TOOLS)
        counts = report.by_risk
        assert counts["LOW"] == 1       # readFile
        assert counts["MEDIUM"] == 1    # writeFile
        assert counts["HIGH"] == 1      # deleteFile
        assert counts["CRITICAL"] == 1  # bash

    def test_has_critical(self) -> None:
        report = scan_server("filesystem", _MIXED_TOOLS)
        assert report.has_critical is True

    def test_has_high(self) -> None:
        report = scan_server("filesystem", _MIXED_TOOLS)
        assert report.has_high is True

    def test_read_only_server(self) -> None:
        tools = [
            {"name": "readFile", "description": ""},
            {"name": "listDirectory", "description": ""},
            {"name": "getFileInfo", "description": ""},
        ]
        report = scan_server("filesystem", tools)
        assert report.by_risk["LOW"] == 3
        assert report.has_critical is False
        assert report.has_high is False

    def test_tools_list_length(self) -> None:
        report = scan_server("filesystem", _MIXED_TOOLS)
        assert len(report.tools) == 4

    def test_each_result_type(self) -> None:
        report = scan_server("filesystem", _MIXED_TOOLS)
        for tool in report.tools:
            assert isinstance(tool, ToolScanResult)
            assert tool.server_id == "filesystem"
            assert tool.risk_label in ("LOW", "MEDIUM", "HIGH", "CRITICAL")

    def test_to_dict_shape(self) -> None:
        report = scan_server("filesystem", _MIXED_TOOLS)
        d = report.to_dict()
        assert "serverId" in d
        assert "tools" in d
        assert "byRisk" in d
        assert "hasCritical" in d
        assert "suggestedExitCode" in d


# ---------------------------------------------------------------------------
# Exit code logic
# ---------------------------------------------------------------------------


class TestExitCodeLogic:
    def test_all_low_exit_0(self) -> None:
        report = scan_server("filesystem", [
            {"name": "readFile", "description": ""},
            {"name": "listDir", "description": ""},
        ])
        assert report.suggested_exit_code() == 0

    def test_has_high_exit_1(self) -> None:
        report = scan_server("filesystem", [
            {"name": "readFile", "description": ""},
            {"name": "deleteFile", "description": "Permanently delete"},
        ])
        assert report.suggested_exit_code() == 1

    def test_has_critical_exit_2(self) -> None:
        report = scan_server("filesystem", [
            {"name": "bash", "description": ""},
        ])
        assert report.suggested_exit_code() == 2

    def test_critical_overrides_high(self) -> None:
        report = scan_server("filesystem", [
            {"name": "deleteFile", "description": "delete"},
            {"name": "bash", "description": ""},
        ])
        # Has both HIGH and CRITICAL — should still be 2
        assert report.suggested_exit_code() == 2


# ---------------------------------------------------------------------------
# CLI — main() entry point
# ---------------------------------------------------------------------------


class TestCLIMain:
    def test_cli_json_output_for_bash(self, capsys: pytest.CaptureFixture[str]) -> None:
        from sint.scanner import main

        with pytest.raises(SystemExit) as exc_info:
            main(["--server", "myserver", "--json", "bash"])
        out = capsys.readouterr().out
        data = json.loads(out)
        assert data["serverId"] == "myserver"
        assert data["hasCritical"] is True
        # Exit code 2 for CRITICAL
        assert exc_info.value.code == 2

    def test_cli_json_output_for_read_file(self, capsys: pytest.CaptureFixture[str]) -> None:
        from sint.scanner import main

        with pytest.raises(SystemExit) as exc_info:
            main(["--server", "fs", "--json", "readFile"])
        out = capsys.readouterr().out
        data = json.loads(out)
        assert data["byRisk"]["LOW"] == 1
        assert exc_info.value.code == 0

    def test_cli_exit_0_for_safe_tools(self) -> None:
        from sint.scanner import main

        with pytest.raises(SystemExit) as exc_info:
            main(["--server", "fs", "--json", "readFile", "listDir"])
        assert exc_info.value.code == 0

    def test_cli_exit_2_for_critical(self) -> None:
        from sint.scanner import main

        with pytest.raises(SystemExit) as exc_info:
            main(["--server", "fs", "--json", "bash"])
        assert exc_info.value.code == 2

    def test_cli_no_tools_error(self) -> None:
        from sint.scanner import main

        with pytest.raises(SystemExit) as exc_info:
            main(["--server", "fs"])
        # argparse error exits with code 2
        assert exc_info.value.code != 0

    def test_cli_no_color_flag(self, capsys: pytest.CaptureFixture[str]) -> None:
        from sint.scanner import main

        with pytest.raises(SystemExit):
            main(["--server", "fs", "--no-color", "readFile"])
        out = capsys.readouterr().out
        # No ANSI escape codes
        assert "\033[" not in out
