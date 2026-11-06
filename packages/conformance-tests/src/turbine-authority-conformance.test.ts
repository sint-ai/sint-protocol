/**
 * Synthetic turbine authority conformance.
 *
 * Runs the harness behind examples/turbine-authority-demo.mjs, so the demo
 * cannot drift from what is asserted here. The controller is in-memory and
 * every assertion is about how many times it was called.
 */

import { existsSync, readFileSync } from "node:fs";
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
  readSensor(token: SintCapabilityToken): Promise<Proposal & { readonly value?: number }>;
  attemptWrite(label: string, token: SintCapabilityToken, powerKw?: number): Promise<Proposal>;
  propose(label: string, token: SintCapabilityToken, powerKw?: number): Promise<Result<Proposal, { readonly code: string }>>;
  submitForApproval(proposal: Proposal): Result<unknown, { readonly code: string }>;
  approve(proposal: Proposal, by?: string): { readonly status: string } | undefined;
  reject(proposal: Proposal, reason: string): { readonly status: string } | undefined;
  revoke(token: SintCapabilityToken, reason: string): void;
  dispatch(proposal: Proposal, approval?: unknown): Promise<DispatchResult>;
  close(): void;
}

interface SimulatedController {
  readonly calls: readonly { readonly powerKw: number }[];
  readCurrent(): Promise<{ readonly digest: string }>;
}

interface TurbineDemoModule {
  createSimulatedController(): SimulatedController;
  createTurbineHarness(options?: { readonly controller?: SimulatedController }): TurbineHarness;
  runTurbineAuthorityDemo(options: {
    readonly harness?: TurbineHarness;
    readonly print?: (line: string) => void;
    readonly short?: boolean;
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

  describe("short narrative", () => {
    it("still dispatches once and verifies evidence, without the failure tour", async () => {
      const summary = unwrap(await demo.runTurbineAuthorityDemo({ harness, print: () => {}, short: true }));
      expect(summary.controllerCalls).toBe(1);
      expect(summary.outcomes["readOnlyWrite"]).toBe("INSUFFICIENT_PERMISSIONS");
      expect(summary.outcomes["replayedDispatch"]).toBeUndefined();
      expect(harness.ledger.verifyChain().ok).toBe(true);
    });
  });

  describe("authorization", () => {
    it("allows the read-only token to read at T0 and nothing else", async () => {
      const readOnly = unwrap(harness.mintReadToken());

      const read = await harness.readSensor(readOnly);
      expect(read.decision.action).toBe("allow");
      expect(read.decision.assignedTier).toBe("T0_observe");
      expect(read.value).toBe(71.4);

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
      expect(read.value).toBeUndefined();
    });

    it("denies a control-token write that carries no signed simulation evidence", async () => {
      const unproven = await harness.attemptWrite("no evidence", unwrap(harness.mintControlToken()));
      expect(unproven.decision.action).toBe("deny");
      expect(unproven.decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_MISSING");
      expect(calls()).toBe(0);
    });

    it("does not let an issued decision be changed in place", async () => {
      const denied = await harness.attemptWrite("denied", unwrap(harness.mintReadToken()));
      expect(Object.isFrozen(denied.decision)).toBe(true);
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

    it("treats rejection as terminal: the same request cannot go back to an operator", async () => {
      const proposed = await proposal("rejected, resubmitted");
      unwrap(harness.submitForApproval(proposed));
      harness.reject(proposed, "no");

      const resubmitted = harness.submitForApproval(proposed);
      expect(resubmitted.ok ? undefined : resubmitted.error.code).toBe("REQUEST_CLOSED");
      expect(harness.approve(proposed)).toBeUndefined();
      expect(refusalCode(await harness.dispatch(proposed))).toBe("APPROVAL_REQUIRED");
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

  describe("state drift", () => {
    it("refuses dispatch when plant state changes after approval, and keeps the nonce", async () => {
      const base = demo.createSimulatedController();
      let drifted = false;
      const controller: SimulatedController = Object.assign(Object.create(base) as SimulatedController, {
        readCurrent: async () => ({ ...(await base.readCurrent()), ...(drifted && { digest: "f".repeat(64) }) }),
      });
      harness.close();
      harness = demo.createTurbineHarness({ controller });

      const proposed = await approvedProposal("drift");
      drifted = true;
      expect(refusalCode(await harness.dispatch(proposed))).toBe("WORLD_STATE_DRIFTED");
      expect(base.calls).toHaveLength(0);

      drifted = false;
      expect((await harness.dispatch(proposed)).ok).toBe(true);
      expect(base.calls).toHaveLength(1);
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

      // The record itself answers "what was approved, and what was sent?"
      const granted = events.find((event) => event.eventType === "approval.granted");
      expect(granted?.payload["params"]).toEqual({ powerKw: 900 });
      expect(granted?.payload["resource"]).toBe(proposed.request.resource);
      const completed = events.find((event) => event.eventType === "action.completed");
      expect(completed?.payload["controllerReceipt"]).toMatchObject({ powerKw: 900 });

      // Tamper with a copy only. The ledger itself is never modified.
      const copy = structuredClone([...events]) as SintLedgerEvent[];
      const index = copy.findIndex((event) => event.eventType === "approval.granted");
      copy[index] = { ...copy[index]!, payload: { ...copy[index]!.payload, forged: true } };
      const restored = LedgerWriter.restore(copy);
      expect(restored.ok ? undefined : restored.error).toBe(index);
    });
  });

  describe("recorded console", () => {
    const pageUrl = new URL("../../../examples/turbine-authority/console.html", import.meta.url);
    const page = readFileSync(pageUrl, "utf8");
    const embedded = /<script id="trace" type="application\/json">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? "{}";
    const trace = JSON.parse(embedded) as {
      readonly head: string;
      readonly tokenLabels: Readonly<Record<string, string>>;
      readonly steps: readonly { readonly ledgerTo: number; readonly controllerCalls: number }[];
      readonly events: readonly (Omit<SintLedgerEvent, "sequenceNumber"> & { readonly sequenceNumber: string })[];
    };

    it("embeds a real, unmodified run with one dispatch", () => {
      const restored = LedgerWriter.restore(trace.events.map((event) => ({
        ...event,
        sequenceNumber: BigInt(event.sequenceNumber),
      })));
      expect(unwrap(restored).headHash).toBe(trace.head);
      const dispatches = trace.events.filter((event) => event.eventType === "action.completed");
      expect(dispatches).toHaveLength(1);
      expect(dispatches[0]?.payload["controllerReceipt"]).toMatchObject({ powerKw: 900, simulated: true });
      expect(trace.steps.at(-1)?.controllerCalls).toBe(1);
      expect(trace.steps.at(-1)?.ledgerTo).toBe(trace.events.length);
      expect(new Set(Object.values(trace.tokenLabels))).toContain("read token");
    });

    it("cannot reach a network and says what it is", () => {
      expect(page).toContain("default-src 'none'");
      expect(page).not.toMatch(/https?:\/\//);
      expect(page).toContain("Synthetic authorization demo: no turbine physics, connected to nothing");
      expect(page).toContain("does not replace plant safety interlocks");
      expect(page).toContain("no turbine physics");
      expect(page).toContain("900 kW is illustrative");
    });

    it("carries the license notices for its embedded font and icons", () => {
      const notices = new URL("../../../examples/turbine-authority/THIRD-PARTY-NOTICES.txt", import.meta.url);
      expect(existsSync(notices)).toBe(true);
      const text = readFileSync(notices, "utf8");
      expect(page).toContain('font-family: "JetBrains Mono"');
      expect(text).toContain("JetBrains Mono");
      expect(text).toContain("Lucide");
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
