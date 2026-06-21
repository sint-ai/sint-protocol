/**
 * Mission Authority API.
 *
 * Mission-envelope evaluation is independent from capability enforcement.
 * A proposal is executable only when both layers allow it.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  evaluateMissionAuthority,
  checkMissionManifestAttenuation,
  computeMissionManifestPolicyPayload,
  computeMissionManifestSigningPayload,
  computeOperatorAuthorizationSigningPayload,
  computeMissionActionOutcomeSigningPayload,
  missionActionProposalSchema,
  missionActionOutcomeReportSchema,
  missionClassSchema,
  missionManifestSchema,
  sintRequestSchema,
  uuidV7Schema,
  iso8601Schema,
} from "@pshkv/core";
import { hashSha256, verify } from "@pshkv/gate-capability-tokens";
import type {
  MissionActionProposal,
  MissionActionOutcomeReport,
  MissionManifest,
  MissionManifestRevocation,
  SintRequest,
  UUIDv7,
} from "@pshkv/core";
import type { MissionManifestStore } from "@pshkv/persistence";
import type { ServerContext } from "../server.js";

const evaluationSchema = z.object({
  manifestId: uuidV7Schema,
  proposal: missionActionProposalSchema,
  request: sintRequestSchema,
}).strict();

const revocationSchema = z.object({
  reason: z.string().min(1).max(1024),
  revokedBy: z.string().min(1).max(256),
}).strict();

interface MissionAuthorityChainStatus {
  readonly valid: boolean;
  readonly revokedManifestId?: UUIDv7;
  readonly invalidReason?: string;
}

async function inspectMissionAuthorityChain(
  store: MissionManifestStore,
  manifest: MissionManifest,
): Promise<MissionAuthorityChainStatus> {
  const visited = new Set<string>();
  let current: MissionManifest = manifest;

  for (let expectedDepth = manifest.delegationDepth; expectedDepth >= 0; expectedDepth -= 1) {
    if (visited.has(current.manifestId)) {
      return { valid: false, invalidReason: "Mission authority chain contains a cycle" };
    }
    visited.add(current.manifestId);

    const revocation = await store.getRevocation(current.manifestId);
    if (revocation) {
      return { valid: true, revokedManifestId: current.manifestId };
    }
    if (current.delegationDepth !== expectedDepth) {
      return { valid: false, invalidReason: "Mission authority chain depth is inconsistent" };
    }
    if (expectedDepth === 0) {
      return current.parentManifestId
        ? { valid: false, invalidReason: "Root mission authority declares a parent" }
        : { valid: true };
    }
    if (!current.parentManifestId) {
      return { valid: false, invalidReason: "Delegated mission authority is missing its parent" };
    }

    const parent = await store.get(current.parentManifestId);
    if (!parent) {
      return { valid: false, invalidReason: "Mission authority parent is missing" };
    }
    const attenuation = checkMissionManifestAttenuation(parent, current);
    if (!attenuation.ok) {
      return {
        valid: false,
        invalidReason: `Mission authority chain expands parent authority: ${attenuation.error.join(", ")}`,
      };
    }
    current = parent;
  }

  return { valid: false, invalidReason: "Mission authority chain exceeds its declared depth" };
}

function appendEvent(
  ctx: ServerContext,
  event: Parameters<ServerContext["ledger"]["append"]>[0],
): ReturnType<ServerContext["ledger"]["append"]> {
  const written = ctx.ledger.append(event);
  ctx.ledgerStore.append(written).catch((error) => {
    console.error("[SINT] Failed to persist mission authority event:", error);
  });
  return written;
}

async function findExecutableGateEvent(
  ctx: ServerContext,
  actionRef: string,
) {
  const local = ctx.ledger.getAll().find(
    (event) => event.eventType === "mission.authority.evaluated"
      && event.payload["actionRef"] === actionRef
      && event.payload["executable"] === true,
  );
  if (local) return local;

  const persisted = await ctx.ledgerStore.query({
    eventType: "mission.authority.evaluated",
  });
  return persisted.find(
    (event) => event.payload["actionRef"] === actionRef
      && event.payload["executable"] === true,
  );
}

export function missionAuthorityRoutes(ctx: ServerContext): Hono {
  const app = new Hono();

  app.post("/v1/mission-authority/manifests", async (c) => {
    const parsed = missionManifestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid mission manifest", details: parsed.error.issues }, 400);
    }

    const manifest = parsed.data as MissionManifest;
    const computedPolicyHash = hashSha256(
      computeMissionManifestPolicyPayload(manifest),
    );
    if (manifest.policyHash !== computedPolicyHash) {
      return c.json({
        error: "Mission manifest policy hash mismatch",
        declaredPolicyHash: manifest.policyHash,
        computedPolicyHash,
      }, 422);
    }
    if (!verify(
      manifest.issuer,
      manifest.signature,
      computeMissionManifestSigningPayload(manifest),
    )) {
      return c.json({ error: "Invalid mission manifest signature" }, 401);
    }
    if (manifest.parentManifestId) {
      const parent = await ctx.missionManifestStore.get(manifest.parentManifestId);
      if (!parent) {
        return c.json({
          error: "Parent manifest not found",
          parentManifestId: manifest.parentManifestId,
        }, 404);
      }
      const parentChain = await inspectMissionAuthorityChain(
        ctx.missionManifestStore,
        parent,
      );
      if (!parentChain.valid) {
        return c.json({
          error: "Parent mission authority chain is invalid",
          parentManifestId: manifest.parentManifestId,
          reason: parentChain.invalidReason,
        }, 409);
      }
      if (parentChain.revokedManifestId) {
        return c.json({
          error: "Cannot delegate from a revoked mission authority chain",
          parentManifestId: manifest.parentManifestId,
          revokedManifestId: parentChain.revokedManifestId,
        }, 409);
      }
      const attenuation = checkMissionManifestAttenuation(parent, manifest);
      if (!attenuation.ok) {
        return c.json({
          error: "Delegated manifest expands parent authority",
          violations: attenuation.error,
        }, 422);
      }
    }
    const stored = await ctx.missionManifestStore.store(manifest);
    if (stored.status === "duplicate") {
      return c.json({ error: "Manifest already exists", manifestId: manifest.manifestId }, 409);
    }
    if (stored.status === "rollback") {
      return c.json({
        error: "Manifest version does not advance the platform authority head",
        manifestId: manifest.manifestId,
        manifestVersion: manifest.manifestVersion,
        headManifestId: stored.head.manifestId,
        headManifestVersion: stored.head.manifestVersion,
      }, 409);
    }
    if (stored.status === "fork") {
      return c.json({
        error: "Manifest does not directly descend from the platform authority head",
        manifestId: manifest.manifestId,
        parentManifestId: manifest.parentManifestId,
        headManifestId: stored.head.manifestId,
        headManifestVersion: stored.head.manifestVersion,
      }, 409);
    }

    appendEvent(ctx, {
      eventType: "mission.manifest.registered",
      agentId: manifest.issuer,
      payload: {
        manifestId: manifest.manifestId,
        manifestVersion: manifest.manifestVersion,
        platformId: manifest.platformId,
        missionClass: manifest.missionClass,
        policyHash: manifest.policyHash,
      },
    });

    return c.json({ manifest, revoked: false }, 201);
  });

  app.get("/v1/mission-authority/manifests", async (c) => {
    const missionClass = c.req.query("missionClass");
    const activeAt = c.req.query("activeAt");
    const parsedMissionClass = missionClass
      ? missionClassSchema.safeParse(missionClass)
      : undefined;
    if (parsedMissionClass && !parsedMissionClass.success) {
      return c.json({ error: "Invalid missionClass" }, 400);
    }
    const parsedActiveAt = activeAt ? iso8601Schema.safeParse(activeAt) : undefined;
    if (parsedActiveAt && !parsedActiveAt.success) {
      return c.json({ error: "Invalid activeAt" }, 400);
    }

    const manifests = await ctx.missionManifestStore.list({
      platformId: c.req.query("platformId"),
      missionClass: parsedMissionClass?.data,
      activeAt: parsedActiveAt?.data,
    });
    const records = await Promise.all(manifests.map(async (manifest) => ({
      manifest,
      revocation: await ctx.missionManifestStore.getRevocation(manifest.manifestId),
    })));
    return c.json({ manifests: records, total: records.length });
  });

  app.get("/v1/mission-authority/manifests/:manifestId", async (c) => {
    const manifestId = c.req.param("manifestId") as UUIDv7;
    const manifest = await ctx.missionManifestStore.get(manifestId);
    if (!manifest) return c.json({ error: "Manifest not found", manifestId }, 404);
    return c.json({
      manifest,
      revocation: await ctx.missionManifestStore.getRevocation(manifestId),
    });
  });

  app.post("/v1/mission-authority/manifests/:manifestId/revoke", async (c) => {
    const manifestId = c.req.param("manifestId") as UUIDv7;
    const manifest = await ctx.missionManifestStore.get(manifestId);
    if (!manifest) return c.json({ error: "Manifest not found", manifestId }, 404);

    const parsed = revocationSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid revocation", details: parsed.error.issues }, 400);
    }
    const revocation: MissionManifestRevocation = {
      manifestId,
      ...parsed.data,
      revokedAt: new Date().toISOString(),
    };
    const revoked = await ctx.missionManifestStore.revoke(revocation);
    if (!revoked) {
      return c.json({ error: "Manifest already revoked", manifestId }, 409);
    }

    appendEvent(ctx, {
      eventType: "mission.manifest.revoked",
      agentId: manifest.issuer,
      payload: { ...revocation },
    });
    return c.json({ status: "revoked", revocation });
  });

  app.post("/v1/mission-authority/evaluate", async (c) => {
    const parsed = evaluationSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid evaluation request", details: parsed.error.issues }, 400);
    }

    const manifestId = parsed.data.manifestId as UUIDv7;
    const manifest = await ctx.missionManifestStore.get(manifestId);
    if (!manifest) return c.json({ error: "Manifest not found", manifestId }, 404);
    if (parsed.data.proposal.actionRef !== parsed.data.request.requestId) {
      return c.json({ error: "proposal.actionRef must equal request.requestId" }, 400);
    }
    if (
      parsed.data.proposal.resource !== parsed.data.request.resource
      || parsed.data.proposal.action !== parsed.data.request.action
      || parsed.data.proposal.platformIdentity !== parsed.data.request.agentId
    ) {
      return c.json({ error: "Proposal and gateway request describe different actions" }, 400);
    }
    const invalidAuthorization = parsed.data.proposal.operatorAuthorizations.find(
      (authorization) => !verify(
        authorization.operatorId,
        authorization.signature,
        computeOperatorAuthorizationSigningPayload(authorization),
      ),
    );
    if (invalidAuthorization) {
      return c.json({
        error: "Invalid operator authorization signature",
        authorizationId: invalidAuthorization.authorizationId,
      }, 401);
    }

    const authorityChain = await inspectMissionAuthorityChain(
      ctx.missionManifestStore,
      manifest,
    );
    const authorityHead = await ctx.missionManifestStore.getAuthorityHead(
      manifest.platformIdentity,
    );
    const supersededBy = authorityHead?.manifestId !== manifest.manifestId
      ? authorityHead
      : undefined;
    const proposal = {
      ...parsed.data.proposal,
      authorityRevoked: parsed.data.proposal.authorityRevoked
        || !authorityChain.valid
        || Boolean(authorityChain.revokedManifestId),
    } as MissionActionProposal;
    const evaluatedAt = new Date().toISOString();
    let authorityDecision = evaluateMissionAuthority({
      manifest,
      proposal,
      evaluatedAt,
    });
    if (supersededBy) {
      authorityDecision = {
        actionRef: proposal.actionRef,
        manifestId,
        action: "deny",
        evaluatedAt,
        reasonCode: "MANIFEST_SUPERSEDED",
        reason: `Manifest was superseded by authority version ${supersededBy.manifestVersion}`,
      };
    }
    const policyDecision = await ctx.gateway.intercept(parsed.data.request as SintRequest);
    let executable = authorityDecision.action === "allow"
      && policyDecision.action === "allow";
    let executionClaim;
    if (executable) {
      const effect = proposal.effectId
        ? manifest.effectConstraints.find(
          (candidate) => candidate.effectId === proposal.effectId,
        )
        : undefined;
      executionClaim = await ctx.missionManifestStore.claimAction({
        actionRef: proposal.actionRef,
        manifestId,
        ...(proposal.effectId ? { effectId: proposal.effectId } : {}),
        claimedAt: evaluatedAt,
      }, effect?.maxUses);
      if (executionClaim.status !== "claimed") {
        executable = false;
        authorityDecision = {
          ...authorityDecision,
          action: "deny",
          reasonCode: executionClaim.status === "duplicate"
            ? "ACTION_REPLAY_DETECTED"
            : "EFFECT_USE_LIMIT_EXCEEDED",
          reason: executionClaim.status === "duplicate"
            ? "Action reference has already been claimed for execution"
            : "Effect use limit has been reached",
        };
      }
    }

    const receipt = appendEvent(ctx, {
      eventType: "mission.authority.evaluated",
      agentId: parsed.data.request.agentId,
      tokenId: parsed.data.request.tokenId,
      payload: {
        manifestId,
        actionRef: proposal.actionRef,
        platformId: proposal.platformId,
        resource: proposal.resource,
        action: proposal.action,
        authorityDecision,
        policyDecision,
        executable,
        executionClaim,
        authorityChain,
        authorityHead: authorityHead && {
          manifestId: authorityHead.manifestId,
          manifestVersion: authorityHead.manifestVersion,
        },
      },
    });

    return c.json({
      authorityDecision,
      policyDecision,
      executable,
      gateReceiptEventId: receipt.eventId,
      authorityChain,
      authorityHead: authorityHead && {
        manifestId: authorityHead.manifestId,
        manifestVersion: authorityHead.manifestVersion,
      },
      executionClaim,
    });
  });

  app.post("/v1/mission-authority/actions/:actionRef/outcome", async (c) => {
    const actionRef = c.req.param("actionRef");
    const parsed = missionActionOutcomeReportSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid mission action outcome", details: parsed.error.issues }, 400);
    }
    const report = parsed.data as MissionActionOutcomeReport;
    if (report.actionRef !== actionRef) {
      return c.json({ error: "Outcome actionRef does not match route" }, 400);
    }

    const manifest = await ctx.missionManifestStore.get(report.manifestId);
    if (!manifest) {
      return c.json({ error: "Manifest not found", manifestId: report.manifestId }, 404);
    }
    if (
      report.platformIdentity !== manifest.platformIdentity
      || !verify(
        report.platformIdentity,
        report.signature,
        computeMissionActionOutcomeSigningPayload(report),
      )
    ) {
      return c.json({ error: "Invalid platform-signed mission outcome" }, 401);
    }

    const gateEvent = await findExecutableGateEvent(ctx, actionRef);
    if (!gateEvent || gateEvent.payload["manifestId"] !== report.manifestId) {
      return c.json({ error: "Executable mission gate receipt not found", actionRef }, 409);
    }
    const executionClaim = gateEvent.payload["executionClaim"] as {
      status?: string;
      claim?: { claimedAt?: string };
    } | undefined;
    const claimedAt = executionClaim?.claim?.claimedAt;
    if (
      executionClaim?.status !== "claimed"
      || !claimedAt
      || Date.parse(report.completedAt) < Date.parse(claimedAt)
    ) {
      return c.json({ error: "Outcome does not follow a valid execution claim" }, 409);
    }

    const finalized = await ctx.missionManifestStore.finalizeAction(report);
    if (finalized.status === "missing_claim") {
      return c.json({ error: "Execution claim not found", actionRef }, 409);
    }
    if (finalized.status === "duplicate") {
      return c.json({
        error: "Mission action outcome already finalized",
        actionRef,
        outcome: finalized.report,
      }, 409);
    }

    const completionEvent = appendEvent(ctx, {
      eventType: report.outcome === "completed"
        ? "action.completed"
        : report.outcome === "failed"
          ? "action.failed"
          : "action.rolledback",
      agentId: report.platformIdentity,
      payload: {
        actionRef,
        manifestId: report.manifestId,
        gateReceiptEventId: gateEvent.eventId,
        outcome: report.outcome,
        completedAt: report.completedAt,
        detailsDigest: report.detailsDigest,
        platformSignature: report.signature,
      },
    });

    return c.json({
      status: "finalized",
      outcome: report,
      gateReceiptEventId: gateEvent.eventId,
      completionReceiptEventId: completionEvent.eventId,
    }, 201);
  });

  app.get("/v1/mission-authority/actions/:actionRef/evidence", (c) => {
    const actionRef = c.req.param("actionRef");
    const events = ctx.ledger.getAll().filter(
      (event) => event.payload["actionRef"] === actionRef,
    );
    if (events.length === 0) {
      return c.json({ error: "Mission evidence not found", actionRef }, 404);
    }
    const serialized = events.map((event) => ({
      ...event,
      sequenceNumber: event.sequenceNumber.toString(),
    }));
    return c.json({
      actionRef,
      events: serialized,
      chainIntegrity: ctx.ledger.verifyChain().ok,
    });
  });

  return app;
}
