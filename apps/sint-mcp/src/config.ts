/**
 * SINT MCP — Configuration.
 *
 * Loads config from JSON file, environment variables, and CLI args.
 *
 * @module @sint/mcp/config
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Downstream MCP server config. */
export interface DownstreamServerConfig {
  /** Command to spawn (stdio transport). */
  readonly command?: string;
  /** Arguments for the command. */
  readonly args?: readonly string[];
  /** URL for SSE transport (mutually exclusive with command). */
  readonly url?: string;
  /** Per-server policy overrides. */
  readonly policy?: {
    /** Maximum tier this server's tools can reach. */
    readonly maxTier?: "T0_observe" | "T1_prepare" | "T2_act" | "T3_commit";
    /** Force approval for all tools on this server. */
    readonly requireApproval?: boolean;
  };
  /** Environment variables to pass to spawned process. */
  readonly env?: Record<string, string>;
}

/** Full SINT MCP configuration. */
export interface SintMCPConfig {
  /** Downstream MCP servers to connect to. */
  readonly servers: Record<string, DownstreamServerConfig>;
  /** Default policy mode. */
  readonly defaultPolicy: "permissive" | "cautious" | "strict";
  /** Approval timeout in milliseconds. */
  readonly approvalTimeoutMs: number;
  /** Transport mode. */
  readonly transport: "stdio" | "sse";
  /** SSE port (only used when transport is "sse"). */
  readonly port: number;
  /** Agent private key (hex). If not set, auto-generates. */
  readonly agentPrivateKey?: string;
}

/** Default configuration values. */
const DEFAULTS: SintMCPConfig = {
  servers: {},
  defaultPolicy: "cautious",
  approvalTimeoutMs: 120_000,
  transport: "stdio",
  port: 3200,
};

/**
 * Load configuration from all sources.
 *
 * Priority: CLI args > env vars > config file > defaults.
 */
export function loadConfig(argv: string[] = process.argv.slice(2)): SintMCPConfig {
  // Parse CLI args
  const cliArgs = parseCliArgs(argv);

  // Load config file
  const configPath = cliArgs.config
    ?? process.env["SINT_MCP_CONFIG"]
    ?? findConfigFile();

  let fileConfig: Partial<SintMCPConfig> = {};
  if (configPath && existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    try {
      fileConfig = JSON.parse(raw) as Partial<SintMCPConfig>;
    } catch (err) {
      throw new Error(
        `Failed to parse SINT MCP config file "${configPath}": ${err instanceof Error ? err.message : String(err)}.\n` +
        `Ensure it is valid JSON. See sint-mcp.config.example.json for reference.`,
      );
    }
  }

  // Merge: defaults < file < env < cli
  return {
    servers: fileConfig.servers ?? DEFAULTS.servers,
    defaultPolicy: (
      cliArgs.defaultPolicy
      ?? process.env["SINT_MCP_POLICY"]
      ?? fileConfig.defaultPolicy
      ?? DEFAULTS.defaultPolicy
    ) as SintMCPConfig["defaultPolicy"],
    approvalTimeoutMs: Number(
      cliArgs.approvalTimeoutMs
      ?? process.env["SINT_MCP_APPROVAL_TIMEOUT"]
      ?? fileConfig.approvalTimeoutMs
      ?? DEFAULTS.approvalTimeoutMs,
    ),
    transport: (
      cliArgs.transport
      ?? process.env["SINT_MCP_TRANSPORT"]
      ?? fileConfig.transport
      ?? DEFAULTS.transport
    ) as SintMCPConfig["transport"],
    port: Number(
      cliArgs.port
      ?? process.env["SINT_MCP_PORT"]
      ?? fileConfig.port
      ?? DEFAULTS.port,
    ),
    agentPrivateKey:
      cliArgs.agentPrivateKey
      ?? process.env["SINT_AGENT_PRIVATE_KEY"]
      ?? fileConfig.agentPrivateKey,
  };
}

/** Look for config file in cwd. */
function findConfigFile(): string | undefined {
  const candidates = [
    resolve(process.cwd(), "sint-mcp.config.json"),
    resolve(process.cwd(), ".sint-mcp.json"),
  ];
  return candidates.find((p) => existsSync(p));
}

interface CliArgs {
  config?: string;
  transport?: string;
  port?: string;
  defaultPolicy?: string;
  approvalTimeoutMs?: string;
  agentPrivateKey?: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--config" && argv[i + 1]) {
      args.config = argv[++i];
    } else if (arg === "--stdio") {
      args.transport = "stdio";
    } else if (arg === "--sse") {
      args.transport = "sse";
    } else if (arg === "--port" && argv[i + 1]) {
      args.port = argv[++i];
    } else if (arg === "--policy" && argv[i + 1]) {
      args.defaultPolicy = argv[++i];
    } else if (arg === "--timeout" && argv[i + 1]) {
      args.approvalTimeoutMs = argv[++i];
    }
  }
  return args;
}
