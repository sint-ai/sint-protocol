import { ApprovalTier } from '@pshkv/core';
import { createHash } from 'crypto';

export type EmergencyTrigger = 'medical' | 'fire' | 'security' | 'fall' | 'flood' | 'gas-leak';
export type TriggerSource = 'sensor' | 'manual' | 'ai';

export interface EmergencyJustification {
  reason: EmergencyTrigger;
  triggeredBy: TriggerSource;
  evidenceHash: string;
  location?: string;
}

export interface BypassToken {
  bypassId: string;
  originalTier: ApprovalTier;
  bypassedTo: ApprovalTier;
  justification: {
    reason: EmergencyTrigger;
    triggeredBy: TriggerSource;
    evidence: string;
  };
  emergencyContext: {
    triggeredAt: Date;
    expiresAt: Date;
    autoExpire: boolean;
  };
  mandatoryAudit: boolean;
}

export interface AuditEntry {
  type: string;
  bypassId: string;
  originalTier: ApprovalTier;
  justification: EmergencyTrigger;
  triggeredAt: Date;
  expiresAt: Date;
  requiresReview: boolean;
  signature: string;
}

export class EmergencyBypassProtocol {
  private bypasses = new Map<string, BypassToken>();
  private auditLog: AuditEntry[] = [];

  bypassTier(action: { tier: ApprovalTier }, justification: EmergencyJustification): BypassToken {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour max

    const bypass: BypassToken = {
      bypassId: this.generateBypassId(),
      originalTier: action.tier,
      bypassedTo: ApprovalTier.T0_OBSERVE,
      justification: {
        reason: justification.reason,
        triggeredBy: justification.triggeredBy,
        evidence: justification.evidenceHash,
      },
      emergencyContext: {
        triggeredAt: now,
        expiresAt,
        autoExpire: true,
      },
      mandatoryAudit: true,
    };

    this.bypasses.set(bypass.bypassId, bypass);
    this.logEmergencyBypass(bypass);

    return bypass;
  }

  private logEmergencyBypass(bypass: BypassToken): AuditEntry {
    const entry: AuditEntry = {
      type: 'emergency-bypass',
      bypassId: bypass.bypassId,
      originalTier: bypass.originalTier,
      justification: bypass.justification.reason,
      triggeredAt: bypass.emergencyContext.triggeredAt,
      expiresAt: bypass.emergencyContext.expiresAt,
      requiresReview: true,
      signature: this.signBypass(bypass),
    };

    this.auditLog.push(entry);
    return entry;
  }

  isEmergencyContextActive(bypassId: string): boolean {
    const bypass = this.bypasses.get(bypassId);
    if (!bypass) return false;

    return bypass.emergencyContext.autoExpire && bypass.emergencyContext.expiresAt > new Date();
  }

  getEmergencyContext(bypassId: string): BypassToken | undefined {
    const bypass = this.bypasses.get(bypassId);
    if (bypass && this.isEmergencyContextActive(bypassId)) {
      return bypass;
    }
    return undefined;
  }

  verifyBypassSignature(bypassId: string, signature: string): boolean {
    const bypass = this.bypasses.get(bypassId);
    if (!bypass) return false;

    const expectedSignature = this.signBypass(bypass);
    return expectedSignature === signature;
  }

  getMetrics(): {
    totalBypasses: number;
    activeBypasses: number;
    byReason: Record<EmergencyTrigger, number>;
    bySource: Record<TriggerSource, number>;
  } {
    const byReason: Record<EmergencyTrigger, number> = {
      medical: 0,
      fire: 0,
      security: 0,
      fall: 0,
      flood: 0,
      'gas-leak': 0,
    };

    const bySource: Record<TriggerSource, number> = {
      sensor: 0,
      manual: 0,
      ai: 0,
    };

    let active = 0;

    this.bypasses.forEach((bypass) => {
      if (this.isEmergencyContextActive(bypass.bypassId)) {
        active++;
      }
      byReason[bypass.justification.reason]++;
      bySource[bypass.justification.triggeredBy]++;
    });

    return {
      totalBypasses: this.bypasses.size,
      activeBypasses: active,
      byReason,
      bySource,
    };
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  private signBypass(bypass: BypassToken): string {
    const data = `${bypass.bypassId}:${bypass.originalTier}:${bypass.justification.reason}:${bypass.emergencyContext.triggeredAt.toISOString()}`;
    return createHash('sha256').update(data).digest('hex');
  }

  private generateBypassId(): string {
    return `bypass_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}
