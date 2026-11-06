/**
 * Synthetic turbine authority conformance.
 *
 * Runs the harness behind examples/turbine-authority-demo.mjs, so the demo
 * cannot drift from what is asserted here. The controller is in-memory and
 * every assertion is about how many times it was called.
 */

import net from "node:net";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PolicyDecision, Result, SintCapabilityToken, SintLedgerEvent, SintRequest } from "@pshkv/core";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";

interface Proposal {
  readonly label: string;
  readonly token: SintCapabilityToken;
  readonly request: SintRequest;
  readonly decision: PolicyDecision;
}

type DispatchResult = Result<unknown, { readonly code: string; readonly message: string }>;

interface TurbineHarness {
  readonly controller: { readonly calls: readonly { readonly powerKw: number }[] };
  readonly ledger: LedgerWriter;
  mintReadToken(): Result<SintCapabilityToken, string>;
  mintControlToken(): Result<SintCapabilityToken, string>;
  setCentralAvailable(available: boolean): void;
  readSensor(token: SintCapabilityToken): Promise<Proposal>;
  attemptWrite(label: string, token: SintCapabilityToken, powerKw?: number): Promise<Proposal>;
  propose(label: string, token: SintCapabilityToken, powerKw?: number): Promise<Result<Proposal, { readonly code: string }>>;
  submitForApproval(proposal: Proposal): unknown;
  approve(proposal: Proposal, by?: string): { readonly status: string } | undefined;
  reject(proposal: Proposal, reason: string): { readonly status: string } | undefined;
  revoke(token: SintCapabilityToken, reason: string): void;
  dispatch(proposal: Proposal, approval?: unknown): Promise<DispatchResult>;
  close(): void;
}

interface TurbineDemoModule {
  createTurbineHarness(): TurbineHarness;
  runTurbineAuthorityDemo(options: {
    readonly harness?: TurbineHarness;
    readonly print?: (line: string) => void;
  }): Promise<Result<{
    readonly controllerCalls: number;
    readonly outcomes: Readonly<Record<string, string>>;
  }, { readonly step: string; readonly message: string }>>;
}

function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) expect.fail(`Expected ok result, got ${JSON.stringify(result.error)}`);
  return result.value;
}

function refusalCode(result: DispatchResult): string | undefined {
  return result.ok ? undefined : result.error.code;
}

function refusalMessage(result: DispatchResult): string | undefined {
  return result.ok ? undefined : result.error.message;
}

describe("Synthetic turbine authority conformance", () => {
  let demo: TurbineDemoModule;
  let harness: TurbineHarness;

  const calls = (): number => harness.controller.calls.length;

  async function proposal(label: string, powerKw?: number): Promise<Proposal> {
    return unwrap(await harness.propose(label, unwrap(harness.mintControlToken()), powerKw));
  }

  async function approvedProposal(label: string): Promise<Proposal> {
    const proposed = await proposal(label);
    harness.submitForApproval(proposed);
    expect(harness.approve(proposed)?.status).toBe("approved");
    return proposed;
  }

  beforeAll(async () => {
    const modulePath = new URL("../../../examples/turbine-authority-demo.mjs", import.meta.url).href;
    demo = await import(/* @vite-ignore */ modulePath) as TurbineDemoModule;
  });

  beforeEach(() => {
    harness = demo.createTurbineHarness();
  });

  afterEach(() => {
    harness.close();
  });

  describe("full narrative", () => {
    it("reaches the controller once and fails closed everywhere else, without touching a network", async () => {
      const connect = vi.spyOn(net.Socket.prototype, "connect");
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const outcome = await demo.runTurbineAuthorityDemo({ harness, print: () => {} });

      expect(unwrap(outcome)).toMatchObject({
        controllerCalls: 1,
        outcomes: {
          readOnlyWrite: "INSUFFICIENT_PERMISSIONS",
          rejectedDispatch: "APPROVAL_REQUIRED",
          centralUnavailable: "EDGE_CENTRAL_UNAVAILABLE",
          offlineDispatch: "AUTHORIZATION_NOT_EXECUTABLE",
          revokedDispatch: "AUTHORIZATION_VERIFICATION_FAILED",
          replayedDispatch: "SIMULATION_RECEIPT_REPLAYED",
        },
      });
      expect(calls()).toBe(1);
      expect(connect).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(harness.ledger.verifyChain().ok).toBe(true);
      connect.mockRestore();
      fetchSpy.mockRestore();
    });
  });

  describe("authorization", () => {
    it("allows the read-only token to read at T0 and nothing else", async () => {
      const readOnly = unwrap(harness.mintReadToken());

      const read = await harness.readSensor(readOnly);
      expect(read.decision.action).toBe("allow");
      expect(read.decision.assignedTier).toBe("T0_observe");

      const write = await harness.attemptWrite("write", readOnly);
      expect(write.decision.action).toBe("deny");
      expect(write.decision.denial?.policyViolated).toBe("INSUFFICIENT_PERMISSIONS");
      expect(refusalCode(await harness.dispatch(write))).toBeDefined();
      expect(calls()).toBe(0);
    });

    it("does not let the control token read the sensor", async () => {
      const control = unwrap(harness.mintControlToken());
      const read = await harness.readSensor(control);
      expect(read.decision.action).toBe("deny");
    });

    it("denies a control-token write that carries no signed simulation evidence", async () => {
      const unproven = await harness.attemptWrite("no evidence", unwrap(harness.mintControlToken()));
      expect(unproven.decision.action).toBe("deny");
      expect(unproven.decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_MISSING");
      expect(calls()).toBe(0);
    });

    it("refuses a decision that this gateway did not issue", async () => {
      const proposed = await approvedProposal("forged decision");
      const forged = { ...proposed, decision: { ...proposed.decision } };
      const result = await harness.dispatch(forged);
      expect(refusalCode(result)).toBe("AUTHORIZATION_VERIFICATION_FAILED");
      expect(calls()).toBe(0);
    });
  });

  describe("approval", () => {
    it("escalates at T2 and does not dispatch without an approval", async () => {
      const proposed = await proposal("pending");
      expect(proposed.decision.action).toBe("escalate");
      expect(proposed.decision.assignedTier).toBe("T2_act");
      expect(refusalCode(await harness.dispatch(proposed))).toBe("APPROVAL_REQUIRED");
      expect(calls()).toBe(0);
    });

    it("keeps a rejected proposal undispatchable, even with a fabricated approval", async () => {
      const proposed = await proposal("rejected");
      harness.submitForApproval(proposed);
      expect(harness.reject(proposed, "not now")?.status).toBe("denied");

      expect(refusalCode(await harness.dispatch(proposed))).toBe("APPROVAL_REQUIRED");
      const fabricated = {
        status: "approved",
        requestId: proposed.request.requestId,
        approvedAt: "2026-11-05T00:00:00.000000Z",
        approvers: ["operator-on-shift"],
        simulationReceiptId: proposed.request.executionContext?.simulationEvidence?.receiptId,
      };
      expect(refusalCode(await harness.dispatch(proposed, fabricated)))
        .toBe("AUTHORIZATION_VERIFICATION_FAILED");
      expect(calls()).toBe(0);
    });

    it("ignores an approver outside the signed quorum", async () => {
      const proposed = await proposal("unlisted approver");
      harness.submitForApproval(proposed);
      expect(harness.approve(proposed, "unlisted-person")).toBeUndefined();
      expect(refusalCode(await harness.dispatch(proposed))).toBe("APPROVAL_REQUIRED");
      expect(calls()).toBe(0);
    });

    it("does not let an approval carry a different setpoint value", async () => {
      const proposed = await approvedProposal("value swap");
      const swapped = {
        ...proposed,
        request: { ...proposed.request, params: { powerKw: 1_800 } },
      };
      const result = await harness.dispatch(swapped);
      expect(refusalCode(result)).toBe("AUTHORIZATION_VERIFICATION_FAILED");
      expect(refusalMessage(result)).toContain("SIMULATION_CONTEXT_MISMATCH");
      expect(calls()).toBe(0);
    });
  });

  describe("single dispatch", () => {
    it("dispatches an approved proposal once", async () => {
      const proposed = await approvedProposal("single");
      const result = await harness.dispatch(proposed);
      expect(result.ok).toBe(true);
      expect(calls()).toBe(1);
      expect(harness.controller.calls[0]?.powerKw).toBe(900);
    });
  });

  describe("offline denial", () => {
    it("denies a new proposal when central approval is unavailable", async () => {
      harness.setCentralAvailable(false);
      const proposed = await proposal("offline");
      expect(proposed.decision.action).toBe("deny");
      expect(proposed.decision.denial?.policyViolated).toBe("EDGE_CENTRAL_UNAVAILABLE");
      expect(refusalCode(await harness.dispatch(proposed))).toBe("AUTHORIZATION_NOT_EXECUTABLE");
      expect(calls()).toBe(0);
    });

    it("keeps T0 reads working while central approval is unavailable", async () => {
      harness.setCentralAvailable(false);
      const read = await harness.readSensor(unwrap(harness.mintReadToken()));
      expect(read.decision.action).toBe("allow");
    });

    it("holds an already-approved dispatch while central is down, without spending its nonce", async () => {
      const proposed = await approvedProposal("approved then offline");

      harness.setCentralAvailable(false);
      const held = await harness.dispatch(proposed);
      expect(refusalMessage(held)).toContain("EDGE_CENTRAL_UNAVAILABLE");
      expect(calls()).toBe(0);

      harness.setCentralAvailable(true);
      expect((await harness.dispatch(proposed)).ok).toBe(true);
      expect(calls()).toBe(1);
    });
  });

  describe("revocation", () => {
    it("blocks a dispatch when the token is revoked after approval", async () => {
      const proposed = await approvedProposal("revoked");
      harness.revoke(proposed.token, "withdrawn");

      const result = await harness.dispatch(proposed);
      expect(refusalCode(result)).toBe("AUTHORIZATION_VERIFICATION_FAILED");
      expect(refusalMessage(result)).toContain("TOKEN_REVOKED");
      expect(calls()).toBe(0);
    });
  });

  describe("replay protection", () => {
    it("refuses a sequential replay of the same authorization", async () => {
      const proposed = await approvedProposal("replay");
      expect((await harness.dispatch(proposed)).ok).toBe(true);

      expect(refusalCode(await harness.dispatch(proposed))).toBe("SIMULATION_RECEIPT_REPLAYED");
      expect(calls()).toBe(1);
    });

    it("dispatches once when the same authorization races itself", async () => {
      const proposed = await approvedProposal("race");
      const results = await Promise.all([
        harness.dispatch(proposed),
        harness.dispatch(proposed),
        harness.dispatch(proposed),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok).map(refusalCode))
        .toEqual(["SIMULATION_RECEIPT_REPLAYED", "SIMULATION_RECEIPT_REPLAYED"]);
      expect(calls()).toBe(1);
    });
  });

  describe("evidence", () => {
    it("records approval, dispatch, and refusal in a chain that detects tampering", async () => {
      const proposed = await approvedProposal("evidence");
      await harness.dispatch(proposed);
      await harness.dispatch(proposed);

      const events = harness.ledger.getAll();
      const types = events.map((event) => event.eventType);
      expect(types).toEqual(expect.arrayContaining([
        "simulation.receipt.issued",
        "approval.requested",
        "approval.granted",
        "action.completed",
        "action.failed",
      ]));
      expect(harness.ledger.verifyChain().ok).toBe(true);

      // Tamper with a copy only. The ledger itself is never modified.
      const copy = structuredClone([...events]) as SintLedgerEvent[];
      const index = copy.findIndex((event) => event.eventType === "approval.granted");
      copy[index] = { ...copy[index]!, payload: { ...copy[index]!.payload, forged: true } };
      const restored = LedgerWriter.restore(copy);
      expect(restored.ok ? undefined : restored.error).toBe(index);
    });
  });

  describe("known limit", () => {
    // Pins what the README says is illustrative. If a signed power limit is
    // added, this should fail and the demo's claims should be revisited.
    it("does not limit the setpoint value: an absurd number escalates like any other", async () => {
      const absurd = await proposal("absurd value", 1_000_000_000);
      expect(absurd.decision.action).toBe("escalate");
      expect(absurd.decision.assignedTier).toBe("T2_act");
    });
  });
});
