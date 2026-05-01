/**
 * License manager: feature flagging by SINT Protocol tier.
 *
 * Mirrors Applied Intuition's "Android for physical machines" GTM:
 * customers license modules independently rather than buying the whole stack.
 */

export type LicenseTier = 'core_os' | 'autonomy_stack' | 'dev_tooling' | 'compliance_pack' | 'enterprise';

export interface FeatureMatrix {
  core_os: string[];
  autonomy_stack: string[];
  dev_tooling: string[];
  compliance_pack: string[];
  enterprise: string[];
}

export const DEFAULT_FEATURE_MATRIX: FeatureMatrix = {
  core_os: [
    'agent_runtime',
    'plan_mode',
    'edge_agent',
    'ledger_basic',
  ],
  autonomy_stack: [
    'mcp_integration',
    'cloud_agent',
    'multi_step_planning',
    'distillation_pipeline',
    'agent_sim',
  ],
  dev_tooling: [
    'dashboard',
    'replay_ui',
    'sim_real_matcher',
    'debugger',
    'adversarial_tester',
  ],
  compliance_pack: [
    'drr_tracking',
    'approval_workflow',
    'evidence_ledger',
    'safety_statistics',
    'regulator_export',
  ],
  enterprise: [
    'sso',
    'audit_log_retention',
    'priority_support',
    'private_deployment',
    'sla_99_99',
  ],
};

export interface License {
  customerId: string;
  tiers: LicenseTier[];
  expiresAt: number; // ms epoch
  featureOverrides?: string[];
  signature: string; // HMAC of the above
}

export class LicenseManager {
  private license?: License;
  private matrix: FeatureMatrix;

  constructor(matrix: FeatureMatrix = DEFAULT_FEATURE_MATRIX) {
    this.matrix = matrix;
  }

  load(license: License) {
    this.license = license;
  }

  /** Check if the loaded license enables a feature. */
  hasFeature(feature: string): boolean {
    if (!this.license) return false;
    if (this.license.expiresAt < Date.now()) return false;
    if (this.license.featureOverrides?.includes(feature)) return true;
    for (const tier of this.license.tiers) {
      if (this.matrix[tier].includes(feature)) return true;
    }
    return false;
  }

  /** Throw if feature unavailable; otherwise no-op. */
  assertFeature(feature: string): void {
    if (!this.hasFeature(feature)) {
      throw new Error(`Feature '${feature}' not licensed under current tier(s): ${this.license?.tiers.join(', ') ?? 'none'}`);
    }
  }

  /** List all enabled features. */
  enabledFeatures(): string[] {
    if (!this.license) return [];
    if (this.license.expiresAt < Date.now()) return [];
    const set = new Set<string>(this.license.featureOverrides ?? []);
    for (const tier of this.license.tiers) {
      for (const f of this.matrix[tier]) set.add(f);
    }
    return [...set];
  }

  /** Number of days until license expiry. */
  daysUntilExpiry(): number {
    if (!this.license) return -1;
    return Math.max(0, Math.ceil((this.license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
  }
}
