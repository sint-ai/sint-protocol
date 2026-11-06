/**
 * Synthetic turbine-generator authority demo. See examples/turbine-authority/README.md.
 *
 * The generator is fictional. This file opens no socket and imports no OPC UA
 * client; the endpoint below is only a label inside signed tokens.
 *
 *   pnpm run demo:turbine-authority           print the whole run
 *   pnpm run demo:turbine-authority --step    press Enter between steps
 */
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { ApprovalTier, canonicalJsonStringify, err, ok } from "../packages/core/dist/index.js";
import {
  RevocationStore,
  generateKeypair,
  generateUUIDv7,
  hashSha256,
  issueCapabilityToken,
  nowISO8601,
} from "../packages/capability-tokens/dist/index.js";
import {
  EvidenceLedgerSimulationReceiptRecorder,
  LedgerWriter,
} from "../packages/evidence-ledger/dist/index.js";
import {
  ApprovalQueue,
  DefaultSimulationEvidencePolicy,
  PolicyGateway,
} from "../packages/policy-gateway/dist/index.js";
import {
  ExecutionBroker,
  InMemorySimulationReceiptNonceStore,
} from "../packages/execution-broker/dist/index.js";
import {
  DeterministicEffectSimulator,
  InMemorySimulationArtifactStore,
} from "../packages/engine-effect-simulator/dist/index.js";
import {
  opcUaNodeToResourceUri,
  opcUaOperationToAction,
} from "../packages/bridge-opcua/dist/index.js";

/** `.invalid` is reserved by RFC 2606 and never resolves. */
const ENDPOINT = "opc.tcp://fictional-generator.invalid:4840";
const SENSOR_NODE = "ns=2;s=Generator01.BearingTemperature";
const SETPOINT_NODE = "ns=2;s=Generator01.PowerSetpoint";
const OPERATOR = "operator-on-shift";

/** Illustrative only. No signed token field or gateway check limits this number. */
const ILLUSTRATIVE_POWER_KW = 900;

const READ_TOKEN_TTL_MS = 60 * 60_000;
const CONTROL_TOKEN_TTL_MS = 5 * 60_000;
/**
 * Evidence lifetime for a human-paced walkthrough, including the policy age
 * limits below. Those default to 30s (receipt) and 5s (world state), which a
 * presenter talking between steps would exceed.
 */
const EVIDENCE_TTL_MS = 5 * 60_000;

/** The broker's event names are not ledger event types; record the closest one. */
const LEDGER_TYPE_FOR_BROKER_EVENT = {
  "execution.dispatched": "action.completed",
  "execution.rejected": "action.failed",
  "execution.failed": "action.failed",
};

/**
 * Stands in for an effect model so the receipt-bearing path can run. It
 * evaluates no turbine physics and no power limit: its "pass" means only that
 * the signed-evidence plumbing was exercised.
 */
const PLACEHOLDER_SETPOINT_MODEL = {
  id: "synthetic-setpoint-placeholder",
  supports: (effectPlan) => effectPlan.action === "write",
  evaluate: () => ok({
    checks: [{
      check: "synthetic-placeholder",
      status: "pass",
      expected: "no turbine physics or power limit evaluated",
    }],
    result: {
      outcome: "pass",
      collisions: 0,
      safetyZoneViolations: 0,
      assumptions: ["Placeholder model: evaluates no turbine physics or power limit"],
    },
  }),
};

/** In-memory stand-in for a controller. It is the only thing that "dispatches". */
export function createSimulatedController() {
  const calls = [];
  const plantContext = { unit: "Generator01", mode: "synthetic-steady-state", alarms: [] };
  return {
    calls,
    readBearingTemperatureC: () => 71.4,
    async readCurrent() {
      const observedAt = Date.now();
      return {
        digest: hashSha256(canonicalJsonStringify(plantContext)),
        observedAt: new Date(observedAt).toISOString(),
        validUntil: new Date(observedAt + EVIDENCE_TTL_MS).toISOString(),
        stateEpoch: "synthetic-epoch-1",
      };
    },
    async dispatch(request) {
      const receipt = {
        controllerReceiptId: generateUUIDv7(),
        requestId: request.requestId,
        node: SETPOINT_NODE,
        powerKw: request.params.powerKw,
        appliedAt: nowISO8601(),
        callNumber: calls.length + 1,
        simulated: true,
      };
      calls.push(receipt);
      return ok(receipt);
    },
  };
}

/** Wires existing SINT packages around one fictional generator. Nothing here decides policy. */
export function createTurbineHarness({ controller = createSimulatedController() } = {}) {
  const issuer = generateKeypair();
  const agent = generateKeypair();
  const simulatorKey = generateKeypair();
  const ledger = new LedgerWriter();
  const revocations = new RevocationStore();
  const queue = new ApprovalQueue();
  const tokens = new Map();
  const proposals = new Map();
  const recordedApprovals = new Map();
  const issuedDecisions = new WeakSet();
  const sensor = opcUaNodeToResourceUri(SENSOR_NODE, ENDPOINT);
  const setpoint = opcUaNodeToResourceUri(SETPOINT_NODE, ENDPOINT);
  let centralAvailable = true;

  const audit = (eventType, tokenId, payload) => ledger.append({
    eventType,
    agentId: agent.publicKey,
    tokenId,
    payload,
  });

  const gateway = new PolicyGateway({
    resolveToken: (id) => tokens.get(id),
    trustedIssuers: [issuer.publicKey],
    revocationStore: revocations,
    emitLedgerEvent: (event) => {
      ledger.append({
        eventType: event.eventType,
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
    },
    edgeControlPlane: {
      checkCentralEscalation: () => ({
        allowed: centralAvailable,
        reason: centralAvailable ? undefined : "central approval plane unavailable",
      }),
    },
    simulationEvidencePolicy: new DefaultSimulationEvidencePolicy({
      trustedSignerKeys: [simulatorKey.publicKey],
      tierRequirements: { [ApprovalTier.T2_ACT]: { minEvidenceGrade: "deterministic" } },
      maxReceiptAgeMs: EVIDENCE_TTL_MS,
      maxWorldStateAgeMs: EVIDENCE_TTL_MS,
    }),
  });

  const simulator = new DeterministicEffectSimulator({
    signerPublicKey: simulatorKey.publicKey,
    signerPrivateKey: simulatorKey.privateKey,
    version: "0.0.0-synthetic",
    modelDigest: hashSha256(PLACEHOLDER_SETPOINT_MODEL.id),
    models: [PLACEHOLDER_SETPOINT_MODEL],
    artifactStore: new InMemorySimulationArtifactStore(),
    receiptRecorder: new EvidenceLedgerSimulationReceiptRecorder(ledger),
    receiptTtlMs: EVIDENCE_TTL_MS,
  });

  queue.on((event) => {
    if (event.type === "queued") {
      const { request, reason, decision } = event.request;
      audit("approval.requested", request.tokenId, {
        requestId: request.requestId,
        reason,
        tier: decision.assignedTier,
      });
    }
    if (event.type !== "resolved") return;
    const { request } = proposals.get(event.requestId);
    const { resolution } = event;
    if (resolution.status === "approved") {
      recordedApprovals.set(event.requestId, {
        status: "approved",
        requestId: event.requestId,
        approvedAt: resolution.at,
        approvers: resolution.approvers,
        simulationReceiptId: request.executionContext.simulationEvidence.receiptId,
      });
    }
    const eventType = { approved: "approval.granted", denied: "approval.denied" }[resolution.status]
      ?? "approval.timeout";
    audit(eventType, request.tokenId, { requestId: event.requestId, resolution });
  });

  /**
   * The broker's verifier makes no policy decision of its own. It confirms the
   * decision and approval came from this gateway and queue, then asks the
   * gateway again, because the broker does not check revocation or central
   * availability and either may have changed since approval.
   */
  const authorizationVerifier = {
    async verify(request, { decision, approval }) {
      if (!issuedDecisions.has(decision)) {
        return err({ message: "Decision was not issued by this gateway" });
      }
      if (approval !== undefined && approval !== recordedApprovals.get(request.requestId)) {
        return err({ message: "Approval was not recorded by the approval queue" });
      }
      const current = await gateway.intercept(request);
      if (current.action !== decision.action) {
        const violated = current.denial?.policyViolated ?? current.action;
        return err({ message: `Gateway re-check no longer authorizes this request: ${violated}` });
      }
      return ok(true);
    },
  };

  const broker = new ExecutionBroker({
    authorizationVerifier,
    nonceStore: new InMemorySimulationReceiptNonceStore(),
    worldStateProvider: controller,
    adapter: controller,
    emitEvent: ({ eventType, requestId, receiptId, payload }) => {
      audit(LEDGER_TYPE_FOR_BROKER_EVENT[eventType], proposals.get(requestId)?.token.tokenId, {
        brokerEvent: eventType,
        requestId,
        receiptId,
        ...payload,
      });
    },
  });

  function mintToken(resource, actions, ttlMs, constraints) {
    const issued = issueCapabilityToken({
      issuer: issuer.publicKey,
      subject: agent.publicKey,
      resource,
      actions,
      constraints,
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      revocable: true,
    }, issuer.privateKey);
    if (issued.ok) tokens.set(issued.value.tokenId, issued.value);
    return issued;
  }

  function buildRequest(token, resource, operation, params) {
    return {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource,
      action: opcUaOperationToAction(operation),
      params,
      recentActions: [],
    };
  }

  async function decide(label, token, request) {
    const decision = await gateway.intercept(request);
    issuedDecisions.add(decision);
    const proposal = { label, token, request, decision };
    proposals.set(request.requestId, proposal);
    return proposal;
  }

  return {
    controller,
    ledger,
    queue,
    mintReadToken: () => mintToken(sensor, ["read"], READ_TOKEN_TTL_MS, {}),
    mintControlToken: () => mintToken(setpoint, ["write"], CONTROL_TOKEN_TTL_MS, {
      quorum: { required: 1, authorized: [OPERATOR] },
    }),
    setCentralAvailable(available) {
      centralAvailable = available;
    },
    readSensor: (token) => decide("sensor read", token, buildRequest(token, sensor, "read", {})),
    attemptWrite: (label, token, powerKw = ILLUSTRATIVE_POWER_KW) =>
      decide(label, token, buildRequest(token, setpoint, "write", { powerKw })),

    /** Attaches a signed receipt for this exact request, then asks the gateway. */
    async propose(label, token, powerKw = ILLUSTRATIVE_POWER_KW) {
      const base = buildRequest(token, setpoint, "write", { powerKw });
      const preflight = await gateway.preflightSimulation(base);
      if (!preflight.ok) return err({ code: preflight.error.code, message: preflight.error.reason });
      const receipt = await simulator.simulate(preflight.value, await controller.readCurrent());
      if (!receipt.ok) return err({ code: receipt.error.code, message: receipt.error.message });
      const request = { ...base, executionContext: { simulationEvidence: receipt.value } };
      return ok(await decide(label, token, request));
    },

    submitForApproval({ request, decision, token }) {
      return queue.enqueue(request, decision, decision.escalation?.approvalQuorum, token);
    },
    approve: ({ request }, by = OPERATOR) =>
      queue.resolve(request.requestId, { status: "approved", by }),
    reject: ({ request }, reason, by = OPERATOR) =>
      queue.resolve(request.requestId, { status: "denied", by, reason }),

    revoke(token, reason) {
      revocations.revoke(token.tokenId, reason, OPERATOR);
      audit("token.revoked", token.tokenId, { reason, revokedBy: OPERATOR });
    },

    /** Everything that reaches the controller goes through this one call. */
    dispatch({ request, decision }, approval = recordedApprovals.get(request.requestId)) {
      return broker.execute(request, { decision, ...(approval !== undefined && { approval }) });
    },

    /** Key events, read back from the ledger itself. Simulation receipts and gateway re-checks are omitted. */
    summarizeLedger() {
      const seen = new Set();
      const lines = [];
      for (const event of ledger.getAll()) {
        const { requestId, decision, tier, policyViolated, reason, code, resolution } = event.payload;
        const label = proposals.get(requestId)?.label ?? "";
        let text;
        if (event.eventType === "policy.evaluated" && requestId !== undefined && !seen.has(requestId)) {
          seen.add(requestId);
          text = `gateway ${decision} ${tier}${policyViolated ? ` ${policyViolated}` : ""}`;
        } else if (event.eventType === "approval.requested") text = "approval requested";
        else if (event.eventType === "approval.denied") text = `operator rejected (${resolution.by})`;
        else if (event.eventType === "approval.granted") text = `operator approved (${resolution.by})`;
        else if (event.eventType === "token.revoked") text = `control token revoked: ${reason}`;
        else if (event.eventType === "action.completed") text = "dispatched to simulated controller";
        else if (event.eventType === "action.failed") text = `dispatch refused ${code}`;
        if (text !== undefined) {
          const clock = event.timestamp.slice(11, 19);
          lines.push(`#${String(event.sequenceNumber).padStart(2, "0")} ${clock}  ${text}${label ? `  [${label}]` : ""}`);
        }
      }
      return lines;
    },

    close: () => queue.dispose(),
  };
}

/** Runs the seven-step story. Resolves to err at the first unexpected outcome. */
export async function runTurbineAuthorityDemo({
  harness = createTurbineHarness(),
  print = console.log,
  pause = async () => {},
} = {}) {
  const { controller, ledger } = harness;
  const calls = () => controller.calls.length;
  const outcomes = {};
  let dispatched;

  const latestEvent = () => {
    const event = ledger.getAll().at(-1);
    return `#${event.sequenceNumber} ${event.eventType} ${event.hash.slice(0, 16)}...`;
  };

  function showDecision({ decision }, action, tier) {
    const violated = decision.denial ? ` ${decision.denial.policyViolated}` : "";
    print(`  Gateway: ${decision.action} (${decision.assignedTier})${violated}`);
    const why = decision.denial?.reason ?? decision.escalation?.reason;
    if (why !== undefined) print(`  Reason: ${why}`);
    return decision.action === action && decision.assignedTier === tier
      ? ok(decision)
      : err(`expected ${action} (${tier}), got ${decision.action} (${decision.assignedTier})`);
  }

  /** Any refusal counts: a slow presenter can see an expiry instead of the usual code. */
  function showRefused(name, result, callsBefore) {
    if (result.ok) return err("dispatch succeeded when it must be refused");
    outcomes[name] = result.error.code;
    print(`  Broker: refused ${result.error.code}`);
    print(`  Reason: ${result.error.message}`);
    print(`  Controller calls: ${calls()} (${calls() - callsBefore} new)`);
    return calls() === callsBefore ? ok(true) : err("controller was called during a refused dispatch");
  }

  function showNoDispatch() {
    print(`  Controller calls: ${calls()}`);
    return calls() === 0 ? ok(true) : err("controller was called before approval");
  }

  /** Mints, proposes, and approves. Used for the path that reaches the broker. */
  async function approvedProposal(label) {
    const control = harness.mintControlToken();
    if (!control.ok) return err(`control token: ${control.error}`);
    const proposal = await harness.propose(label, control.value);
    if (!proposal.ok) return err(proposal.error.message);
    const shown = showDecision(proposal.value, "escalate", ApprovalTier.T2_ACT);
    if (!shown.ok) return shown;
    harness.submitForApproval(proposal.value);
    const resolution = harness.approve(proposal.value);
    if (resolution?.status !== "approved") return err("operator approval did not resolve");
    print(`  Operator: approved by ${resolution.by}`);
    return ok(proposal.value);
  }

  let readOnly;
  let rejected;
  let approved;

  const steps = [
    ["1. Read fictional bearing temperature with a read-only token", async () => {
      const minted = harness.mintReadToken();
      if (!minted.ok) return err(`read token: ${minted.error}`);
      readOnly = minted.value;
      const proposal = await harness.readSensor(readOnly);
      const shown = showDecision(proposal, "allow", ApprovalTier.T0_OBSERVE);
      if (!shown.ok) return shown;
      print(`  Value: ${controller.readBearingTemperatureC()} C (fictional)`);
      print(`  Ledger: ${latestEvent()}`);
      return ok(true);
    }],

    ["2. Write the fictional power setpoint with that same token", async () => {
      const proposal = await harness.attemptWrite("write with read-only token", readOnly);
      const shown = showDecision(proposal, "deny", ApprovalTier.T3_COMMIT);
      if (!shown.ok) return shown;
      outcomes.readOnlyWrite = proposal.decision.denial.policyViolated;
      return showNoDispatch();
    }],

    ["3. Propose the setpoint with a separate short-lived control token", async () => {
      const control = harness.mintControlToken();
      if (!control.ok) return err(`control token: ${control.error}`);
      const proposal = await harness.propose("proposal 1", control.value);
      if (!proposal.ok) return err(proposal.error.message);
      rejected = proposal.value;
      print(`  Proposed: ${ILLUSTRATIVE_POWER_KW} kW (illustrative; no signed limit applies to this number)`);
      const shown = showDecision(rejected, "escalate", ApprovalTier.T2_ACT);
      if (!shown.ok) return shown;
      return showNoDispatch();
    }],

    ["4. Operator rejects it, then approves a separate proposal", async () => {
      harness.submitForApproval(rejected);
      const resolution = harness.reject(rejected, "Synthetic reason: wait for the next review window");
      if (resolution?.status !== "denied") return err("operator rejection did not resolve");
      print(`  Operator: rejected by ${resolution.by}`);
      const refused = showRefused("rejectedDispatch", await harness.dispatch(rejected), calls());
      if (!refused.ok) return refused;
      print("  New proposal, new token, new evidence:");
      const proposal = await approvedProposal("proposal 2");
      if (!proposal.ok) return proposal;
      approved = proposal.value;
      return showNoDispatch();
    }],

    ["5. Dispatch once through the execution broker", async () => {
      const result = await harness.dispatch(approved);
      if (!result.ok) return err(`${result.error.code}: ${result.error.message}`);
      if (calls() !== 1) return err(`expected exactly one controller call, saw ${calls()}`);
      dispatched = result.value;
      print(`  Broker: dispatched; simulated controller calls: ${calls()}`);
      print(`  Controller receipt: ${JSON.stringify(result.value, null, 2).replaceAll("\n", "\n  ")}`);
      print(`  Ledger: ${latestEvent()}`);
      return ok(true);
    }],

    ["6a. Central approval unavailable", async () => {
      const callsBefore = calls();
      const control = harness.mintControlToken();
      if (!control.ok) return err(`control token: ${control.error}`);
      harness.setCentralAvailable(false);
      const proposal = await harness.propose("proposal 3, central offline", control.value);
      if (!proposal.ok) return err(proposal.error.message);
      const shown = showDecision(proposal.value, "deny", ApprovalTier.T3_COMMIT);
      if (!shown.ok) return shown;
      outcomes.centralUnavailable = proposal.value.decision.denial.policyViolated;
      const refused = showRefused("offlineDispatch", await harness.dispatch(proposal.value), callsBefore);
      harness.setCentralAvailable(true);
      return refused;
    }],

    ["6b. Token revoked after approval, before dispatch", async () => {
      const callsBefore = calls();
      const proposal = await approvedProposal("proposal 4, revoked after approval");
      if (!proposal.ok) return proposal;
      harness.revoke(proposal.value.token, "Synthetic reason: operator withdrew agent authority");
      print("  Control token: revoked");
      return showRefused("revokedDispatch", await harness.dispatch(proposal.value), callsBefore);
    }],

    ["6c. Replay the step 5 dispatch unchanged", async () => {
      print("  Same request, same approval, same receipt:");
      return showRefused("replayedDispatch", await harness.dispatch(approved), calls());
    }],

    ["7. Verify the evidence chain", async () => {
      const verified = ledger.verifyChain();
      if (!verified.ok) return err(`evidence chain failed at event ${verified.error}`);
      const summary = harness.summarizeLedger();
      for (const line of summary) print(`  ${line}`);
      print(`  ${ledger.length} append-only events (${summary.length} key events shown); chain verified`);
      print(`  Head: ${ledger.headHash}`);
      print(`  Controller calls in total: ${calls()}`);
      return ok(true);
    }],
  ];

  print("Synthetic turbine generator authority demo.");
  print("Fictional generator: no device, network, broker, PLC, or customer system is connected.");
  print("Software authorization does not replace plant safety interlocks or the emergency stop.");

  for (const [title, run] of steps) {
    await pause(title);
    print(`\n${title}`);
    const outcome = await run();
    if (!outcome.ok) {
      harness.close();
      return err({ step: title, message: outcome.error });
    }
  }
  harness.close();
  return ok({ controllerCalls: calls(), dispatched, outcomes, ledgerEvents: ledger.length });
}

function isMainModule() {
  return process.argv[1] !== undefined
    && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
}

if (isMainModule()) {
  const stepping = process.argv.includes("--step") && process.stdin.isTTY === true;
  const prompt = stepping ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
  const outcome = await runTurbineAuthorityDemo({
    pause: async (title) => {
      await prompt?.question(`\n[Enter] ${title} `);
    },
  });
  prompt?.close();
  if (!outcome.ok) {
    console.error(`\nDemo stopped at "${outcome.error.step}": ${outcome.error.message}`);
    process.exitCode = 1;
  }
}
