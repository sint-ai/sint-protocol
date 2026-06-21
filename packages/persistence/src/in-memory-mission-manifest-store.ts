/**
 * In-memory mission manifest store for development and tests.
 */

import type {
  MissionManifest,
  MissionManifestRevocation,
  MissionActionOutcomeReport,
  UUIDv7,
} from "@pshkv/core";
import type {
  MissionActionClaim,
  MissionActionClaimResult,
  MissionActionOutcomeResult,
  MissionManifestStoreResult,
  MissionManifestQuery,
  MissionManifestStore,
} from "./interfaces.js";

export class InMemoryMissionManifestStore implements MissionManifestStore {
  private readonly manifests = new Map<string, MissionManifest>();
  private readonly revocations = new Map<string, MissionManifestRevocation>();
  private readonly actionClaims = new Map<string, MissionActionClaim>();
  private readonly actionOutcomes = new Map<string, MissionActionOutcomeReport>();
  private readonly authorityHeads = new Map<string, string>();

  async store(manifest: MissionManifest): Promise<MissionManifestStoreResult> {
    const existing = this.manifests.get(manifest.manifestId);
    if (existing) return { status: "duplicate", manifest: existing };

    const headId = this.authorityHeads.get(manifest.platformIdentity);
    const head = headId ? this.manifests.get(headId) : undefined;
    if (head) {
      if (manifest.manifestVersion <= head.manifestVersion) {
        return { status: "rollback", head };
      }
      if (manifest.parentManifestId !== head.manifestId) {
        return { status: "fork", head };
      }
    }

    this.manifests.set(manifest.manifestId, manifest);
    this.authorityHeads.set(manifest.platformIdentity, manifest.manifestId);
    return { status: "stored", manifest };
  }

  async get(manifestId: UUIDv7): Promise<MissionManifest | undefined> {
    return this.manifests.get(manifestId);
  }

  async getAuthorityHead(
    platformIdentity: string,
  ): Promise<MissionManifest | undefined> {
    const manifestId = this.authorityHeads.get(platformIdentity);
    return manifestId ? this.manifests.get(manifestId) : undefined;
  }

  async list(query: MissionManifestQuery = {}): Promise<readonly MissionManifest[]> {
    return [...this.manifests.values()].filter((manifest) => {
      if (query.platformId && manifest.platformId !== query.platformId) return false;
      if (query.missionClass && manifest.missionClass !== query.missionClass) return false;
      if (query.activeAt) {
        const activeAt = Date.parse(query.activeAt);
        if (
          activeAt < Date.parse(manifest.validFrom)
          || activeAt >= Date.parse(manifest.validUntil)
        ) return false;
      }
      return true;
    });
  }

  async revoke(revocation: MissionManifestRevocation): Promise<boolean> {
    if (
      !this.manifests.has(revocation.manifestId)
      || this.revocations.has(revocation.manifestId)
    ) return false;
    this.revocations.set(revocation.manifestId, revocation);
    return true;
  }

  async getRevocation(
    manifestId: UUIDv7,
  ): Promise<MissionManifestRevocation | undefined> {
    return this.revocations.get(manifestId);
  }

  async claimAction(
    claim: MissionActionClaim,
    effectMaxUses?: number,
  ): Promise<MissionActionClaimResult> {
    const existing = this.actionClaims.get(claim.actionRef);
    if (existing) return { status: "duplicate", claim: existing };

    if (claim.effectId && effectMaxUses !== undefined) {
      const used = [...this.actionClaims.values()].filter(
        (candidate) => candidate.manifestId === claim.manifestId
          && candidate.effectId === claim.effectId,
      ).length;
      if (used >= effectMaxUses) return { status: "effect_limit_exceeded" };
    }

    this.actionClaims.set(claim.actionRef, claim);
    return { status: "claimed", claim };
  }

  async finalizeAction(
    report: MissionActionOutcomeReport,
  ): Promise<MissionActionOutcomeResult> {
    if (!this.actionClaims.has(report.actionRef)) return { status: "missing_claim" };
    const existing = this.actionOutcomes.get(report.actionRef);
    if (existing) return { status: "duplicate", report: existing };
    this.actionOutcomes.set(report.actionRef, report);
    return { status: "finalized", report };
  }
}
