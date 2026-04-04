export {
  toResourceUri,
  toToolId,
  getRiskHint,
  toSintAction,
  isReadOnly,
  isDangerous,
  tierFromAnnotations,
  isShellExecTool,
} from "./mcp-resource-mapper.js";
export type {
  MCPToolCall,
  MCPToolResult,
  MCPInterceptResult,
  MCPRiskHint,
  MCPSession,
  MCPToolAnnotations,
} from "./types.js";
export { MCPSessionManager } from "./mcp-session.js";
export type { CreateSessionOptions } from "./mcp-session.js";
export { MCPInterceptor } from "./mcp-interceptor.js";
export type { MCPInterceptorConfig } from "./mcp-interceptor.js";
export { createSintMiddleware } from "./mcp-middleware.js";
export type { SintMiddlewareConfig, ToolCallContext, ToolHandler } from "./mcp-middleware.js";

// Tool Auth Manifest — MCP SEP-2385 reference implementation
export { TamRegistry, validateAgainstTam, DEFAULT_MANIFESTS } from "./tam.js";
export type { ToolAuthManifest, TamValidationResult } from "./tam.js";

// Tool Definition Signing & Registry
export { InMemoryToolRegistry } from "./tool-registry.js";
export type {
  ToolDefinition,
  SignedToolDefinition,
  ToolRegistry,
} from "./tool-registry.js";
