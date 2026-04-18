import { canonicalJsonStringify, ApprovalTier, RiskTier } from "../packages/core/dist/index.js";
import {
  generateProofReceipt,
  verifyProofReceipt,
} from "../packages/evidence-ledger/dist/index.js";
import {
  generateKeypair,
  hashSha256,
  sign,
  verify,
} from "../packages/capability-tokens/dist/index.js";
import { SINTPDPInterceptor } from "../packages/sint-pdp-interceptor/dist/index.js";

const timestamp = "2026-04-17T07:45:00.000Z";
const tokenId = "01964000-4200-7000-8000-000000000001";
const requestId = "01964000-4100-7000-8000-000000000001";
const agentId = "did:key:z6Mkr7fExampleSINTAgent";

const authority = generateKeypair();

function createLedgerEvent({
  sequenceNumber,
  eventId,
  eventType,
  payload,
  previousHash,
}) {
  const body = {
    eventId,
    sequenceNumber: sequenceNumber.toString(),
    timestamp,
    eventType,
    agentId: authority.publicKey,
    tokenId,
    payload,
    previousHash,
  };

  return {
    ...body,
    sequenceNumber,
    hash: hashSha256(canonicalJsonStringify(body)),
  };
}

function demoGatewayDecision(request) {
  const toolName = request.params?.toolName;

  if (toolName === "deleteFile") {
    return {
      requestId: request.requestId,
      timestamp,
      action: "escalate",
      assignedTier: ApprovalTier.T3_COMMIT,
      assignedRisk: RiskTier.T3_IRREVERSIBLE,
      escalation: {
        requiredTier: ApprovalTier.T3_COMMIT,
        reason: "Irreversible deletion requires human approval",
        timeoutMs: 120000,
        fallbackAction: "deny",
      },
    };
  }

  return {
    requestId: request.requestId,
    timestamp,
    action: "allow",
    assignedTier: ApprovalTier.T1_PREPARE,
    assignedRisk: RiskTier.T1_WRITE_LOW,
    transformations: {
      additionalAuditFields: {
        demoFlow: true,
        receiptMode: "proof-receipt",
      },
    },
  };
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printJson(label, value) {
  console.log(`\n${label}`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const interceptor = new SINTPDPInterceptor({
    gateway: {
      async intercept(request) {
        return demoGatewayDecision({
          ...request,
          params: {
            ...request.params,
            toolName:
              typeof request.resource === "string"
                ? request.resource.split("/").pop()
                : undefined,
          },
        });
      },
    },
    defaultTokenId: tokenId,
    now: () => timestamp,
    createRequestId: () => requestId,
  });

  console.log("SINT PDP Interceptor — 5 minute quickstart");
  console.log("Command: pnpm run build && pnpm run demo:interceptor-quickstart");

  printSection("1. Allow path with receipt");

  const allowRequest = {
    caller_identity: agentId,
    mcp_call: {
      serverName: "filesystem",
      toolName: "writeFile",
      params: {
        path: "/workspace/demo.txt",
        content: "hello from SINT",
      },
    },
  };

  const allowResult = await interceptor.runGuarded(allowRequest, {
    verifyGatePrerequisite: async () => ({
      ok: true,
      evidenceRef: "sint://ledger/gate-allow-001",
    }),
    execute: async () => ({
      status: "ok",
      bytesWritten: 15,
    }),
  });

  printJson("Request", allowRequest);
  printJson("Decision", allowResult.decision.decision);

  const event1 = createLedgerEvent({
    sequenceNumber: 1n,
    eventId: "01964000-5000-7000-8000-000000000001",
    eventType: "request.received",
    payload: {
      requestId,
      resource: "mcp://filesystem/writeFile",
    },
    previousHash: "0".repeat(64),
  });

  const event2 = createLedgerEvent({
    sequenceNumber: 2n,
    eventId: "01964000-5000-7000-8000-000000000002",
    eventType: "policy.evaluated",
    payload: {
      requestId,
      action: allowResult.decision.decision.action,
      tier: allowResult.decision.tier,
    },
    previousHash: event1.hash,
  });

  const receipt = generateProofReceipt(
    event2,
    [event1, event2],
    authority.publicKey,
    (data) => sign(authority.privateKey, data),
  );

  printJson("Receipt", {
    eventId: receipt.eventId,
    eventHash: receipt.eventHash,
    generatedAt: receipt.generatedAt,
    hashChainLength: receipt.hashChain.length,
    signaturePrefix: `${receipt.signature.slice(0, 16)}...`,
    verified: verifyProofReceipt(receipt, verify),
  });

  printSection("2. Escalation path");

  const escalateRequest = {
    caller_identity: agentId,
    mcp_call: {
      serverName: "filesystem",
      toolName: "deleteFile",
      params: {
        path: "/workspace/production.db",
      },
    },
  };

  const escalateResult = await interceptor.runGuarded(escalateRequest, {
    execute: async () => ({ status: "should-not-run" }),
  });

  printJson("Escalation decision", escalateResult.decision.decision);
  console.log(`Executed downstream work: ${escalateResult.stage === "executed" ? "yes" : "no"}`);

  printSection("3. Fail-closed missing prerequisite");

  const blockedResult = await interceptor.runGuarded(
    {
      caller_identity: agentId,
      mcp_call: {
        serverName: "robot-arm",
        toolName: "moveJoint",
        params: {
          joint: "elbow",
          degrees: 15,
        },
      },
    },
    {
      verifyGatePrerequisite: async () => ({
        ok: false,
        reason: "No verified gate receipt attached to actuator command",
      }),
      execute: async () => ({ status: "should-not-run" }),
    },
  );

  printJson("Blocked decision", blockedResult.decision.decision);
  console.log(`Final stage: ${blockedResult.stage}`);
  console.log("\nOutcome: the interceptor denied execution before any downstream side effect.");
}

await main();
