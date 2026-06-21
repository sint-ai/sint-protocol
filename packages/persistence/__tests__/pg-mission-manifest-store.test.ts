import { describe, expect, it, vi } from "vitest";
import type {
  MissionManifest,
  MissionManifestRevocation,
} from "@pshkv/core";
import { PgMissionManifestStore } from "../src/pg-mission-manifest-store.js";

const MANIFEST_ID = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";

function manifest(): MissionManifest {
  return {
    manifestId: MANIFEST_ID,
    protocolVersion: "0.3.0",
    manifestVersion: 1,
    issuer: "a".repeat(64),
    platformId: "px4-air-01",
    platformIdentity: "b".repeat(64),
    missionClass: "isr",
    validFrom: "2026-06-07T00:00:00.000000Z",
    validUntil: "2026-06-08T00:00:00.000000Z",
    resources: ["mavlink://vehicle/1/camera"],
    actions: ["capture"],
    effectConstraints: [],
    approvalPolicy: {
      minimumQuorum: 0,
      authorizedOperatorIds: [],
      authorizationMaxAgeMs: 60_000,
    },
    abortConditions: [
      { conditionId: "estop", signal: "estop", response: "terminate" },
    ],
    maxDelegationDepth: 0,
    delegationDepth: 0,
    policyHash: "c".repeat(64),
    signature: "d".repeat(128),
  };
}

describe("PgMissionManifestStore", () => {
  it("atomically inserts manifests and advances the authority head", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const store = new PgMissionManifestStore(
      {
        connect: vi.fn(async () => ({ query, release })),
      } as unknown as import("pg").Pool,
    );

    expect((await store.store(manifest())).status).toBe("stored");
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("INSERT INTO sint_mission_manifests");
    expect(sql).toContain("INSERT INTO sint_mission_authority_heads");
    const [, values] = query.mock.calls[4] as [string, unknown[]];
    expect(values[5]).toBe(JSON.stringify(manifest()));
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns the existing manifest when its ID already exists", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ manifest: JSON.stringify(manifest()) }] })
      .mockResolvedValueOnce({ rows: [] });
    const store = new PgMissionManifestStore(
      {
        connect: vi.fn(async () => ({ query, release: vi.fn() })),
      } as unknown as import("pg").Pool,
    );
    expect((await store.store(manifest())).status).toBe("duplicate");
  });

  it("builds parameterized operational filters", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = new PgMissionManifestStore(
      { query } as unknown as import("pg").Pool,
    );
    await store.list({
      platformId: "px4-air-01",
      missionClass: "isr",
      activeAt: "2026-06-07T12:00:00.000000Z",
    });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("platform_id = $1");
    expect(sql).toContain("mission_class = $2");
    expect(sql).toContain("valid_from <= $3");
    expect(sql).toContain("valid_until > $3");
    expect(values).toEqual([
      "px4-air-01",
      "isr",
      "2026-06-07T12:00:00.000000Z",
    ]);
  });

  it("appends revocations only for existing, unrevoked manifests", async () => {
    const revocation: MissionManifestRevocation = {
      manifestId: MANIFEST_ID,
      reason: "Mission cancelled",
      revokedBy: "operator-1",
      revokedAt: "2026-06-07T12:30:00.000000Z",
    };
    const query = vi.fn(async () => ({ rows: [{ manifest_id: MANIFEST_ID }], rowCount: 1 }));
    const store = new PgMissionManifestStore(
      { query } as unknown as import("pg").Pool,
    );

    expect(await store.revoke(revocation)).toBe(true);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM sint_mission_manifests");
    expect(sql).toContain("ON CONFLICT (manifest_id) DO NOTHING");
    expect(values).toEqual([
      MANIFEST_ID,
      "Mission cancelled",
      "operator-1",
      "2026-06-07T12:30:00.000000Z",
    ]);
  });

  it("reconstructs manifests and revocations from database rows", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ manifest: JSON.stringify(manifest()) }] })
      .mockResolvedValueOnce({
        rows: [{
          manifest_id: MANIFEST_ID,
          reason: "Mission cancelled",
          revoked_by: "operator-1",
          revoked_at: "2026-06-07T12:30:00.000000Z",
        }],
      });
    const store = new PgMissionManifestStore(
      { query } as unknown as import("pg").Pool,
    );

    expect(await store.get(MANIFEST_ID)).toEqual(manifest());
    expect(await store.getRevocation(MANIFEST_ID)).toEqual({
      manifestId: MANIFEST_ID,
      reason: "Mission cancelled",
      revokedBy: "operator-1",
      revokedAt: "2026-06-07T12:30:00.000000Z",
    });
  });

  it("atomically claims actions under an effect-use ceiling", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({
        rows: [{
          action_ref: "action-1",
          manifest_id: MANIFEST_ID,
          effect_id: "capture",
          claimed_at: "2026-06-07T12:30:00.000000Z",
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const store = new PgMissionManifestStore(
      { connect: vi.fn(async () => ({ query, release })) } as unknown as import("pg").Pool,
    );

    const result = await store.claimAction({
      actionRef: "action-1",
      manifestId: MANIFEST_ID,
      effectId: "capture",
      claimedAt: "2026-06-07T12:30:00.000000Z",
    }, 1);
    expect(result.status).toBe("claimed");
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("COUNT(*)");
    expect(sql).toContain("INSERT INTO sint_mission_action_claims");
    const [, values] = query.mock.calls[5] as [string, unknown[]];
    expect(values).toEqual([
      "action-1",
      MANIFEST_ID,
      "capture",
      "2026-06-07T12:30:00.000000Z",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("distinguishes duplicate claims from exhausted effect uses", async () => {
    const duplicateQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          action_ref: "action-1",
          manifest_id: MANIFEST_ID,
          effect_id: null,
          claimed_at: "2026-06-07T12:30:00.000000Z",
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const duplicateStore = new PgMissionManifestStore(
      {
        connect: vi.fn(async () => ({ query: duplicateQuery, release: vi.fn() })),
      } as unknown as import("pg").Pool,
    );
    expect((await duplicateStore.claimAction({
      actionRef: "action-1",
      manifestId: MANIFEST_ID,
      claimedAt: "2026-06-07T12:31:00.000000Z",
    })).status).toBe("duplicate");

    const exhaustedQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const exhaustedStore = new PgMissionManifestStore(
      {
        connect: vi.fn(async () => ({ query: exhaustedQuery, release: vi.fn() })),
      } as unknown as import("pg").Pool,
    );
    expect((await exhaustedStore.claimAction({
      actionRef: "action-2",
      manifestId: MANIFEST_ID,
      effectId: "capture",
      claimedAt: "2026-06-07T12:31:00.000000Z",
    }, 1)).status).toBe("effect_limit_exceeded");
  });

  it("appends one terminal outcome for an existing claim", async () => {
    const report = {
      actionRef: "action-1",
      manifestId: MANIFEST_ID,
      platformIdentity: "b".repeat(64),
      outcome: "completed" as const,
      completedAt: "2026-06-07T12:35:00.000000Z",
      signature: "e".repeat(128),
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ report: JSON.stringify(report) }] });
    const store = new PgMissionManifestStore(
      { query } as unknown as import("pg").Pool,
    );

    expect((await store.finalizeAction(report)).status).toBe("finalized");
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM sint_mission_action_claims");
    expect(sql).toContain("ON CONFLICT (action_ref) DO NOTHING");
    expect(values[4]).toBe(JSON.stringify(report));
  });

  it("distinguishes duplicate outcomes from missing claims", async () => {
    const report = {
      actionRef: "action-1",
      manifestId: MANIFEST_ID,
      platformIdentity: "b".repeat(64),
      outcome: "failed" as const,
      completedAt: "2026-06-07T12:35:00.000000Z",
      signature: "e".repeat(128),
    };
    const duplicateQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ report }] });
    const duplicateStore = new PgMissionManifestStore(
      { query: duplicateQuery } as unknown as import("pg").Pool,
    );
    expect((await duplicateStore.finalizeAction(report)).status).toBe("duplicate");

    const missingQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const missingStore = new PgMissionManifestStore(
      { query: missingQuery } as unknown as import("pg").Pool,
    );
    expect((await missingStore.finalizeAction(report)).status).toBe("missing_claim");
  });
});
