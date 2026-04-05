/**
 * Error thrown when SINT Policy Gateway denies an agent action.
 */
export class SintDeniedError extends Error {
  /** SINT denial reason. */
  readonly reason: string;
  /** Risk tier that triggered the denial. */
  readonly tier?: number;
  /** The tool that was denied. */
  readonly toolName: string;
  /** The resource that was denied. */
  readonly resource: string;

  constructor(opts: {
    toolName: string;
    resource: string;
    reason: string;
    tier?: number;
  }) {
    super(
      `SINT denied tool "${opts.toolName}" (resource: ${opts.resource}): ${opts.reason}`
    );
    this.name = "SintDeniedError";
    this.reason = opts.reason;
    this.tier = opts.tier;
    this.toolName = opts.toolName;
    this.resource = opts.resource;
  }
}
