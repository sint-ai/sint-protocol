/**
 * SINT MCP — Server.
 *
 * The main MCP server that aggregates tools from downstream servers,
 * enforces SINT policy on every call, and exposes built-in SINT tools
 * for approval workflows, audit trail, and server management.
 *
 * @module @sint/mcp/server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ApprovalTier, RiskTier, DEFAULT_TIER_RULES, type SintCapabilityToken, type SintRequest } from "@pshkv/core";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { ApprovalQueue } from "@pshkv/gate-policy-gateway";
import { RevocationStore, generateUUIDv7, nowISO8601, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { DownstreamManager } from "./downstream.js";
import { ToolAggregator, parseNamespace } from "./aggregator.js";
import { PolicyEnforcer } from "./enforcer.js";
import { createAgentIdentity, type AgentIdentity } from "./identity.js";
import {
  getSintToolDefinitions,
  handleSintTool,
  isSintTool,
  type SintToolContext,
} from "./tools/sint-tools.js";
import {
  getInterfaceToolDefinitions,
  handleInterfaceTool,
  isInterfaceTool,
  type InterfaceToolContext,
} from "./tools/interface-tools.js";
import {
  getDelegationToolDefinitions,
  handleDelegationTool,
  isDelegationTool,
  type DelegationToolContext,
} from "./tools/delegation-tools.js";
import { InterfaceStateManager, DelegationTree } from "@pshkv/interface-bridge";
import {
  getSintResources,
  readSintResource,
  type ResourceContext,
} from "./resources/sint-resources.js";
import type { SintMCPConfig } from "./config.js";
import {
  TrajectoryRecorder,
  type TrajectoryOutcome,
} from "./trajectory.js";

/** SINT MCP Server — the security-first multi-MCP proxy. */
const OPERATOR_ONLY_TOOLS = new Set([
  "sint__approve", "sint__deny", "sint__add_server", "sint__remove_server",
  "sint__issue_token", "sint__revoke_token", "sint__revoke_delegation_tree",
  "sint__delegate_to_agent", "sint__interface_mode",
]);

export class SintMCPServer {
  readonly server: Server;
  readonly downstream: DownstreamManager;
  readonly aggregator: ToolAggregator;
  readonly tokenStore: Map<string, SintCapabilityToken>;
  readonly revocationStore: RevocationStore;
  readonly ledger: LedgerWriter;
  readonly gateway: PolicyGateway;
  readonly approvalQueue: ApprovalQueue;
  readonly trajectory: TrajectoryRecorder;
  readonly interfaceState: InterfaceStateManager;
  readonly delegationTree: DelegationTree;

  private identity: AgentIdentity | null = null;
  private enforcer: PolicyEnforcer | null = null;
  private readonly config: SintMCPConfig;
  private readonly trustedIssuers: string[] = [];
  private readonly serverTokenIds = new Map<string, string>();

  constructor(config: SintMCPConfig) {
    this.config = config;

    // Create MCP Server
    this.server = new Server(
      { name: "sint-mcp", version: "0.1.1" },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    // Initialize SINT components
    this.tokenStore = new Map();
    this.revocationStore = new RevocationStore();
    this.ledger = new LedgerWriter();
    this.approvalQueue = new ApprovalQueue({
      defaultTimeoutMs: config.approvalTimeoutMs,
    });
    this.trajectory = new TrajectoryRecorder({
      runId: process.env["PAPERCLIP_RUN_ID"] ?? `run-${Date.now()}`,
      agentId: process.env["PAPERCLIP_AGENT_ID"] ?? "unknown-agent",
      taskId: process.env["PAPERCLIP_TASK_ID"] ?? "unknown-task",
      model: process.env["OPENAI_MODEL"] ?? process.env["MODEL"] ?? "unknown-model",
      outputDir: process.env["SINT_TRAJECTORY_DIR"] ?? ".sint/trajectories",
    });

    this.gateway = new PolicyGateway({
      resolveToken: (id) => this.tokenStore.get(id),
      trustedIssuers: this.trustedIssuers,
      revocationStore: this.revocationStore,
      tierRules: [
        ...[...OPERATOR_ONLY_TOOLS].map(name => ({
          resourcePattern: `mcp://sint/${name}`,
          actions: ["call"],
          baseTier: ApprovalTier.T3_COMMIT,
          baseRisk: RiskTier.T3_IRREVERSIBLE,
        })),
        ...DEFAULT_TIER_RULES,
      ],
      emitLedgerEvent: (event) => {
        this.ledger.append({
          eventType: event.eventType as any,
          agentId: event.agentId,
          tokenId: event.tokenId,
          payload: event.payload,
        });
      },
    });

    // Initialize interface state manager
    this.interfaceState = new InterfaceStateManager(
      process.env["SINT_SESSION_ID"] ?? `session-${Date.now()}`,
    );

    // Initialize delegation tree
    this.delegationTree = new DelegationTree();

    // Initialize downstream & aggregator
    this.downstream = new DownstreamManager();
    this.aggregator = new ToolAggregator(this.downstream);

    // Register MCP handlers
    this.registerHandlers();
  }

  /**
   * Initialize the server: create identity, connect downstreams.
   */
  async initialize(): Promise<void> {
    // Create agent identity
    this.identity = createAgentIdentity(this.config.agentPrivateKey, "mcp://sint/*");
    this.trustedIssuers.push(this.identity.publicKey);

    // Store the default token
    this.tokenStore.set(
      this.identity.defaultToken.tokenId,
      this.identity.defaultToken,
    );

    // Give each configured downstream a separate capability. A compromised
    // server token cannot name tools on another server or proxy control tools.
    for (const name of Object.keys(this.config.servers)) {
      const result = issueCapabilityToken({
        issuer: this.identity.publicKey, subject: this.identity.publicKey,
        resource: `mcp://${name}/*`, actions: ["call"], constraints: {},
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: this.identity.defaultToken.expiresAt, revocable: true,
      }, this.identity.privateKey);
      if (!result.ok) {
        console.error(`Cannot issue configured server capability for ${name}: ${result.error}`);
        continue;
      }
      this.tokenStore.set(result.value.tokenId, result.value);
      this.serverTokenIds.set(name, result.value.tokenId);
    }

    // Create enforcer
    this.enforcer = new PolicyEnforcer(
      this.gateway,
      this.approvalQueue,
      this.downstream,
      this.identity.publicKey,
      serverName => this.serverTokenIds.get(serverName) ?? this.identity!.defaultToken.tokenId,
      this.trajectory,
    );

    // Connect to downstream servers
    await this.connectDownstreams();

    // Refresh tool aggregation
    this.aggregator.refresh();
  }

  /**
   * Get the agent identity (available after initialize()).
   */
  getIdentity(): AgentIdentity | null {
    return this.identity;
  }

  /**
   * Connect to all configured downstream servers.
   */
  private async connectDownstreams(): Promise<void> {
    const entries = Object.entries(this.config.servers);
    const results = await Promise.allSettled(
      entries.map(([name, config]) => this.downstream.addServer(name, config)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const name = entries[i]![0];
      if (result.status === "rejected") {
        console.error(`Failed to connect downstream "${name}": ${result.reason}`);
      }
    }
  }

  /**
   * Register all MCP request handlers.
   */
  private registerHandlers(): void {
    // tools/list — return aggregated tools + SINT built-in tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const downstreamTools = this.aggregator.toMCPToolsList();
      const sintTools = getSintToolDefinitions();
      const interfaceTools = getInterfaceToolDefinitions();
      const delegationTools = getDelegationToolDefinitions();
      return { tools: [...downstreamTools, ...sintTools, ...interfaceTools, ...delegationTools]
        .filter(tool => !OPERATOR_ONLY_TOOLS.has(tool.name)) };
    });

    // prompts/list — SINT currently exposes no prompt templates
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: [] };
    });

    // tools/call — enforce policy then route
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const toolArgs = (args ?? {}) as Record<string, unknown>;

      if (isDelegationTool(name) || isInterfaceTool(name) || isSintTool(name)) {
        if (!this.identity) return { content: [{ type: "text", text: "Server not initialized" }], isError: true };
        const sintRequest: SintRequest = {
          requestId: generateUUIDv7(), timestamp: nowISO8601(),
          agentId: this.identity.publicKey, tokenId: this.identity.defaultToken.tokenId,
          resource: `mcp://sint/${name}`, action: "call", params: toolArgs,
          ...(OPERATOR_ONLY_TOOLS.has(name) ? { mcpPolicy: { maxTier: ApprovalTier.T0_OBSERVE } } : {}),
        };
        const decision = await this.gateway.intercept(sintRequest);
        if (decision.action !== "allow") {
          return { content: [{ type: "text", text: `SINT policy ${decision.action}: ${name}` }], isError: true };
        }
        if (isDelegationTool(name)) return handleDelegationTool(name, toolArgs, this.getDelegationToolContext());
        if (isInterfaceTool(name)) return handleInterfaceTool(name, toolArgs, this.getInterfaceToolContext());
        return handleSintTool(name, toolArgs, this.getToolContext());
      }

      // Parse namespace and enforce policy
      const parsed = parseNamespace(name);
      if (!parsed) {
        return {
          content: [{
            type: "text",
            text: `Invalid tool name "${name}". Use format: serverName__toolName`,
          }],
          isError: true,
        };
      }

      if (!this.enforcer) {
        return {
          content: [{
            type: "text",
            text: "Server not initialized. Call initialize() first.",
          }],
          isError: true,
        };
      }

      const result = await this.enforcer.enforce(parsed, toolArgs);

      if (result.allowed && result.result) {
        return result.result;
      }

      // Denied or escalated
      return {
        content: [{
          type: "text",
          text: result.denyReason ?? "Action denied by SINT policy",
        }],
        isError: true,
      };
    });

    // resources/list
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return { resources: getSintResources() };
    });

    // resources/templates/list — SINT currently exposes no resource templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      return { resourceTemplates: [] };
    });

    // resources/read
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const result = readSintResource(
        request.params.uri,
        this.getResourceContext(),
      );

      if (!result) {
        throw new Error(`Resource not found: ${request.params.uri}`);
      }

      return result;
    });
  }

  /**
   * Get the count of built-in SINT tools (including interface and delegation tools).
   */
  getSintToolCount(): number {
    return getSintToolDefinitions().filter(tool => !OPERATOR_ONLY_TOOLS.has(tool.name)).length
      + getInterfaceToolDefinitions().length + getDelegationToolDefinitions().filter(tool => !OPERATOR_ONLY_TOOLS.has(tool.name)).length;
  }

  async finalizeTrajectory(outcome: TrajectoryOutcome): Promise<string> {
    this.trajectory.markOutcome(outcome);
    return this.trajectory.flushToFile();
  }

  private getToolContext(): SintToolContext {
    return {
      downstream: this.downstream,
      approvalQueue: this.approvalQueue,
      ledger: this.ledger,
      agentPublicKey: this.identity?.publicKey ?? "unknown",
      agentPrivateKey: this.identity?.privateKey ?? "",
      tokenId: this.identity?.defaultToken.tokenId ?? "unknown",
      tokenStore: this.tokenStore,
      revocationStore: this.revocationStore,
    };
  }

  private getInterfaceToolContext(): InterfaceToolContext {
    return {
      interfaceState: this.interfaceState,
      ledger: this.ledger,
      agentPublicKey: this.identity?.publicKey ?? "unknown",
    };
  }

  private getDelegationToolContext(): DelegationToolContext {
    return {
      agentPublicKey: this.identity?.publicKey ?? "unknown",
      agentPrivateKey: this.identity?.privateKey ?? "",
      tokenId: this.identity?.defaultToken.tokenId ?? "unknown",
      tokenStore: this.tokenStore,
      revocationStore: this.revocationStore,
      ledger: this.ledger,
      delegationTree: this.delegationTree,
    };
  }

  private getResourceContext(): ResourceContext {
    return {
      downstream: this.downstream,
      approvalQueue: this.approvalQueue,
      ledger: this.ledger,
      tokenStore: this.tokenStore,
    };
  }

  /**
   * Dispose all resources.
   */
  async dispose(): Promise<void> {
    this.approvalQueue.dispose();
    await this.downstream.dispose();
  }
}
