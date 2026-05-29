import { useState } from "react";
import type { ApprovalRequest, FactoryReceiptChainEntry } from "../api/types.js";

interface ApprovalConductorProps {
  readonly requests: readonly ApprovalRequest[];
  readonly connected: boolean;
  readonly error: string | null;
  readonly onResolve: (
    requestId: string,
    status: "approved" | "denied",
  ) => Promise<void> | void;
}

interface FactoryApprovalEvidence {
  readonly actionType: string;
  readonly cellId?: string;
  readonly targetRobot?: string;
  readonly sourcePose?: string;
  readonly targetPose?: string;
  readonly simulationReceiptId?: string;
  readonly maxVelocityMps?: number;
  readonly maxForceNewtons?: number;
  readonly toolType?: string;
  readonly payloadKg?: number;
  readonly requiresSimulationReceipt?: boolean;
  readonly requiresHumanApproval?: boolean;
  readonly requiresSafetyZoneClear?: boolean;
}

type ReceiptChainStatus = "linked" | "broken";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function factoryActionData(request: ApprovalRequest): Record<string, unknown> | undefined {
  const params = asRecord(request.params);
  const nestedData = asRecord(params?.data);
  return nestedData ?? params;
}

function isReceiptChainEntry(value: unknown): value is FactoryReceiptChainEntry {
  const entry = asRecord(value);
  return (
    entry !== undefined &&
    optionalString(entry.step) !== undefined &&
    optionalString(entry.eventType) !== undefined &&
    optionalString(entry.digest)?.startsWith("sha256:") === true &&
    (entry.previousDigest === null ||
      optionalString(entry.previousDigest)?.startsWith("sha256:") === true)
  );
}

function extractFactoryReceiptChain(
  request: ApprovalRequest,
): readonly FactoryReceiptChainEntry[] {
  const executionContext = asRecord(request.executionContext);
  const rawChain =
    executionContext?.factoryReceiptChain ?? executionContext?.factory_receipt_chain;

  if (!Array.isArray(rawChain)) {
    return [];
  }

  return rawChain.filter(isReceiptChainEntry);
}

function receiptChainStatus(
  chain: readonly FactoryReceiptChainEntry[],
): ReceiptChainStatus {
  const linked = chain.every((entry, index) => {
    if (index === 0) return entry.previousDigest === null;
    return entry.previousDigest === chain[index - 1]?.digest;
  });
  return linked ? "linked" : "broken";
}

function extractFactoryApprovalEvidence(
  request: ApprovalRequest,
): FactoryApprovalEvidence | undefined {
  const data = factoryActionData(request);
  const actionType = optionalString(data?.action_type);
  const looksLikeFactoryAction =
    request.resource === "ros2:///joint_commands" ||
    actionType?.startsWith("robot.") === true;

  if (!data || !actionType || !looksLikeFactoryAction) {
    return undefined;
  }

  return {
    actionType,
    cellId: optionalString(data.cell_id),
    targetRobot: optionalString(data.target_robot),
    sourcePose: optionalString(data.source_pose),
    targetPose: optionalString(data.target_pose),
    simulationReceiptId: optionalString(data.simulation_receipt_id),
    maxVelocityMps:
      optionalNumber(data.max_velocity_mps) ??
      optionalNumber(request.physicalContext?.currentVelocityMps),
    maxForceNewtons:
      optionalNumber(data.max_force_newtons) ??
      optionalNumber(request.physicalContext?.currentForceNewtons),
    toolType: optionalString(data.tool_type),
    payloadKg: optionalNumber(data.payload_kg),
    requiresSimulationReceipt: optionalBoolean(data.requires_simulation_receipt),
    requiresHumanApproval: optionalBoolean(data.requires_human_approval),
    requiresSafetyZoneClear: optionalBoolean(data.requires_safety_zone_clear),
  };
}

function shortId(value: string): string {
  if (value.length <= 28) return value;
  return `${value.slice(0, 16)}...${value.slice(-8)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function evidenceTone(required: boolean | undefined, satisfied: boolean): {
  readonly color: string;
  readonly border: string;
  readonly background: string;
} {
  if (satisfied) {
    return {
      color: "#00cc66",
      border: "rgba(0, 204, 102, 0.45)",
      background: "rgba(0, 204, 102, 0.11)",
    };
  }
  if (required) {
    return {
      color: "#ffd700",
      border: "rgba(255, 215, 0, 0.45)",
      background: "rgba(255, 215, 0, 0.11)",
    };
  }
  return {
    color: "#8896b0",
    border: "rgba(136, 150, 176, 0.3)",
    background: "rgba(136, 150, 176, 0.08)",
  };
}

function EvidencePill({
  label,
  required,
  satisfied,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly satisfied: boolean;
}) {
  const tone = evidenceTone(required, satisfied);
  return (
    <span
      style={{
        border: `1px solid ${tone.border}`,
        borderRadius: "3px",
        background: tone.background,
        color: tone.color,
        fontSize: "0.68rem",
        fontWeight: 700,
        lineHeight: 1,
        padding: "5px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function Field({ label, value }: { readonly label: string; readonly value?: string }) {
  if (!value) return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        color: "#4a5670",
        fontSize: "0.64rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}>
        {label}
      </div>
      <code style={{
        display: "block",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: "#c0cce0",
        fontSize: "0.72rem",
        background: "rgba(255, 255, 255, 0.05)",
        borderRadius: "3px",
        padding: "3px 5px",
      }}>
        {value}
      </code>
    </div>
  );
}

function ReceiptChain({ request }: { readonly request: ApprovalRequest }) {
  const chain = extractFactoryReceiptChain(request);
  if (chain.length === 0) return null;

  const status = receiptChainStatus(chain);

  return (
    <div
      aria-label="Factory receipt chain"
      style={{
        borderTop: "1px solid rgba(0, 212, 255, 0.16)",
        marginTop: "10px",
        paddingTop: "10px",
      }}
    >
      <div style={{
        alignItems: "center",
        display: "flex",
        gap: "8px",
        marginBottom: "7px",
      }}>
        <span style={{
          color: "#d8f7ff",
          fontSize: "0.7rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          Receipt chain
        </span>
        <span style={{
          border: `1px solid ${status === "linked" ? "rgba(0, 204, 102, 0.42)" : "rgba(255, 68, 68, 0.45)"}`,
          borderRadius: "3px",
          color: status === "linked" ? "#00cc66" : "#ff6666",
          fontSize: "0.66rem",
          fontWeight: 800,
          lineHeight: 1,
          padding: "4px 6px",
        }}>
          {status === "linked" ? `${chain.length} linked` : "link break"}
        </span>
      </div>

      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "5px",
      }}>
        {chain.map((entry, index) => (
          <div
            key={`${entry.digest}-${index}`}
            style={{
              alignItems: "center",
              display: "grid",
              gap: "7px",
              gridTemplateColumns: "18px minmax(0, 1fr) minmax(76px, 92px)",
            }}
          >
            <span style={{
              alignItems: "center",
              border: "1px solid rgba(0, 212, 255, 0.28)",
              borderRadius: "3px",
              color: "#00d4ff",
              display: "inline-flex",
              fontSize: "0.62rem",
              fontWeight: 800,
              height: "18px",
              justifyContent: "center",
            }}>
              {index + 1}
            </span>
            <code style={{
              color: "#c0cce0",
              fontSize: "0.68rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {entry.eventType}
            </code>
            <code style={{
              color: "#8896b0",
              fontSize: "0.64rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textAlign: "right",
              whiteSpace: "nowrap",
            }}>
              {shortId(entry.digest)}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

function IndustrialEvidence({
  request,
}: {
  readonly request: ApprovalRequest;
}) {
  const evidence = extractFactoryApprovalEvidence(request);
  if (!evidence) return null;

  const simulationLinked = evidence.simulationReceiptId !== undefined;
  const quorumRequired = request.approvalQuorum?.required;
  const approvalCount = request.approvalCount ?? 0;
  const envelope =
    evidence.maxVelocityMps !== undefined || evidence.maxForceNewtons !== undefined
      ? `${evidence.maxVelocityMps !== undefined ? `${formatNumber(evidence.maxVelocityMps)} m/s` : "n/a"} / ${evidence.maxForceNewtons !== undefined ? `${formatNumber(evidence.maxForceNewtons)} N` : "n/a"}`
      : undefined;
  const tool = evidence.toolType
    ? `${evidence.toolType}${evidence.payloadKg !== undefined ? `, ${formatNumber(evidence.payloadKg)} kg` : ""}`
    : undefined;

  return (
    <div
      aria-label="Factory action approval evidence"
      style={{
        border: "1px solid rgba(0, 212, 255, 0.24)",
        borderRadius: "6px",
        background: "rgba(0, 212, 255, 0.07)",
        marginTop: "10px",
        padding: "10px",
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minWidth: 0,
        marginBottom: "8px",
      }}>
        <span style={{
          border: "1px solid rgba(0, 212, 255, 0.38)",
          borderRadius: "3px",
          color: "#00d4ff",
          flexShrink: 0,
          fontSize: "0.64rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          lineHeight: 1,
          padding: "5px 7px",
          textTransform: "uppercase",
        }}>
          Factory action
        </span>
        <code style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: "#d8f7ff",
          fontSize: "0.72rem",
        }}>
          {evidence.actionType}
        </code>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "8px",
      }}>
        <Field label="Cell" value={evidence.cellId} />
        <Field label="Robot" value={evidence.targetRobot ? shortId(evidence.targetRobot) : undefined} />
        <Field
          label="Move"
          value={evidence.sourcePose && evidence.targetPose
            ? `${evidence.sourcePose} -> ${evidence.targetPose}`
            : undefined}
        />
        <Field
          label="Simulation"
          value={evidence.simulationReceiptId ? shortId(evidence.simulationReceiptId) : undefined}
        />
        <Field label="Envelope" value={envelope} />
        <Field label="Tool" value={tool} />
      </div>

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        marginTop: "10px",
      }}>
        <EvidencePill
          label={`Simulation ${simulationLinked ? "linked" : evidence.requiresSimulationReceipt ? "required" : "optional"}`}
          required={evidence.requiresSimulationReceipt}
          satisfied={simulationLinked}
        />
        <EvidencePill
          label={`Human approval ${quorumRequired
            ? `${approvalCount}/${quorumRequired}`
            : evidence.requiresHumanApproval ? "required" : "optional"}`}
          required={evidence.requiresHumanApproval}
          satisfied={false}
        />
        <EvidencePill
          label={`Safety zone ${evidence.requiresSafetyZoneClear ? "confirm" : "not required"}`}
          required={evidence.requiresSafetyZoneClear}
          satisfied={evidence.requiresSafetyZoneClear !== true}
        />
      </div>

      <ReceiptChain request={request} />
    </div>
  );
}

export function ApprovalConductor({
  requests,
  connected,
  error,
  onResolve,
}: ApprovalConductorProps) {
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  if (requests.length === 0 && !error) {
    return null;
  }

  async function resolve(requestId: string, status: "approved" | "denied") {
    setResolving((prev) => new Set(prev).add(requestId));
    try {
      await onResolve(requestId, status);
    } finally {
      setResolving((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  }

  return (
    <aside
      aria-label="Approval conductor"
      style={{
        position: "absolute",
        top: "64px",
        right: "16px",
        width: "min(440px, calc(100vw - 32px))",
        maxHeight: "calc(100vh - 160px)",
        overflowY: "auto",
        border: "1px solid rgba(26, 48, 96, 0.94)",
        borderRadius: "8px",
        background: "rgba(10, 14, 26, 0.94)",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.42)",
        color: "#fff",
        padding: "14px",
        zIndex: 20,
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "12px",
      }}>
        <span style={{
          color: connected ? "#00cc66" : "#ffd700",
          fontSize: "0.72rem",
        }}>
          {connected ? "●" : "○"}
        </span>
        <strong style={{
          color: "#00d4ff",
          fontSize: "0.78rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          Conductor approvals
        </strong>
        <span style={{
          marginLeft: "auto",
          color: "#8896b0",
          fontSize: "0.72rem",
        }}>
          {requests.length} pending
        </span>
      </div>

      {error && (
        <div style={{
          border: "1px solid rgba(255, 68, 68, 0.38)",
          borderRadius: "6px",
          background: "rgba(255, 68, 68, 0.1)",
          color: "#ff8a8a",
          fontSize: "0.74rem",
          marginBottom: "10px",
          padding: "8px",
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}>
        {requests.map((request) => (
          <div
            key={request.requestId}
            style={{
              border: "1px solid #1a3060",
              borderRadius: "7px",
              background: "#0a1028",
              padding: "12px",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}>
              <span style={{
                background: request.requiredTier === "T3_COMMIT" ? "#ff4444" : "#ffd700",
                borderRadius: "3px",
                color: "#0a0e1a",
                fontSize: "0.68rem",
                fontWeight: 800,
                lineHeight: 1,
                padding: "4px 7px",
              }}>
                {request.requiredTier}
              </span>
              <code style={{
                color: "#c0cce0",
                fontSize: "0.72rem",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {request.resource} / {request.action}
              </code>
              <span style={{
                color: "#8896b0",
                fontSize: "0.68rem",
                marginLeft: "auto",
                whiteSpace: "nowrap",
              }}>
                {timeRemaining(request.expiresAt)}
              </span>
            </div>

            <div style={{
              color: "#8896b0",
              fontSize: "0.72rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {request.reason}
            </div>

            <IndustrialEvidence request={request} />

            <div style={{
              display: "flex",
              gap: "8px",
              marginTop: "10px",
            }}>
              <button
                type="button"
                disabled={resolving.has(request.requestId)}
                onClick={() => void resolve(request.requestId, "approved")}
                style={{
                  width: "96px",
                  height: "32px",
                  border: "1px solid #00cc66",
                  borderRadius: "4px",
                  background: "#00cc66",
                  color: "#07100d",
                  cursor: resolving.has(request.requestId) ? "not-allowed" : "pointer",
                  fontSize: "0.74rem",
                  fontWeight: 800,
                }}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={resolving.has(request.requestId)}
                onClick={() => void resolve(request.requestId, "denied")}
                style={{
                  width: "96px",
                  height: "32px",
                  border: "1px solid #ff4444",
                  borderRadius: "4px",
                  background: "transparent",
                  color: "#ff6666",
                  cursor: resolving.has(request.requestId) ? "not-allowed" : "pointer",
                  fontSize: "0.74rem",
                  fontWeight: 800,
                }}
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
