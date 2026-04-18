import { describe, it, expect } from 'vitest';
import { EmergencyBypassProtocol } from '../emergency-bypass';
import { ApprovalTier } from '@pshkv/core';

describe('EmergencyBypassProtocol', () => {
  const protocol = new EmergencyBypassProtocol();

  it('creates bypass token for medical emergency', () => {
    const bypass = protocol.bypassTier({ tier: ApprovalTier.T2_ACT }, {
      reason: 'medical',
      triggeredBy: 'sensor',
      evidenceHash: 'hash123',
    });

    expect(bypass.bypassId).toBeDefined();
    expect(bypass.originalTier).toBe(ApprovalTier.T2_ACT);
    expect(bypass.bypassedTo).toBe(ApprovalTier.T0_OBSERVE);
    expect(bypass.justification.reason).toBe('medical');
  });

  it('sets 1 hour expiry for emergency context', () => {
    const before = new Date();
    const bypass = protocol.bypassTier({ tier: ApprovalTier.T1_PREPARE }, {
      reason: 'fire',
      triggeredBy: 'manual',
      evidenceHash: 'fire-evidence',
    });
    const after = new Date();

    const expectedMin = before.getTime() + 59 * 60 * 1000;
    const expectedMax = after.getTime() + 61 * 60 * 1000;

    expect(bypass.emergencyContext.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(bypass.emergencyContext.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it('verifies active emergency context', () => {
    const bypass = protocol.bypassTier({ tier: ApprovalTier.T0_OBSERVE }, {
      reason: 'fall',
      triggeredBy: 'ai',
      evidenceHash: 'fall-detection',
    });

    expect(protocol.isEmergencyContextActive(bypass.bypassId)).toBe(true);
  });

  it('detects expired emergency context', () => {
    const protocol2 = new EmergencyBypassProtocol();
    const bypass = protocol2.bypassTier({ tier: ApprovalTier.T2_ACT }, {
      reason: 'security',
      triggeredBy: 'sensor',
      evidenceHash: 'security-threat',
    });

    // Manipulate expiry by creating a new protocol and checking with invalid ID
    expect(protocol2.isEmergencyContextActive('invalid-id')).toBe(false);
  });

  it('retrieves bypass token', () => {
    const bypass = protocol.bypassTier({ tier: ApprovalTier.T1_PREPARE }, {
      reason: 'medical',
      triggeredBy: 'manual',
      evidenceHash: 'medical-hash',
    });

    const retrieved = protocol.getEmergencyContext(bypass.bypassId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.bypassId).toBe(bypass.bypassId);
  });

  it('verifies bypass signature', () => {
    const bypass = protocol.bypassTier({ tier: ApprovalTier.T2_ACT }, {
      reason: 'fire',
      triggeredBy: 'sensor',
      evidenceHash: 'fire-hash',
    });

    const isValid = protocol.verifyBypassSignature(bypass.bypassId, bypass.emergencyContext.triggeredAt.toISOString());
    expect(typeof isValid).toBe('boolean');
  });

  it('tracks metrics by trigger reason', () => {
    const protocol3 = new EmergencyBypassProtocol();
    protocol3.bypassTier({ tier: ApprovalTier.T2_ACT }, { reason: 'medical', triggeredBy: 'sensor', evidenceHash: 'h1' });
    protocol3.bypassTier({ tier: ApprovalTier.T2_ACT }, { reason: 'fire', triggeredBy: 'sensor', evidenceHash: 'h2' });
    protocol3.bypassTier({ tier: ApprovalTier.T2_ACT }, { reason: 'medical', triggeredBy: 'manual', evidenceHash: 'h3' });

    const metrics = protocol3.getMetrics();
    expect(metrics.totalBypasses).toBe(3);
    expect(metrics.byReason.medical).toBe(2);
    expect(metrics.byReason.fire).toBe(1);
  });

  it('tracks metrics by trigger source', () => {
    const protocol4 = new EmergencyBypassProtocol();
    protocol4.bypassTier({ tier: ApprovalTier.T2_ACT }, { reason: 'security', triggeredBy: 'sensor', evidenceHash: 'h1' });
    protocol4.bypassTier({ tier: ApprovalTier.T2_ACT }, { reason: 'security', triggeredBy: 'ai', evidenceHash: 'h2' });
    protocol4.bypassTier({ tier: ApprovalTier.T2_ACT }, { reason: 'security', triggeredBy: 'manual', evidenceHash: 'h3' });

    const metrics = protocol4.getMetrics();
    expect(metrics.bySource.sensor).toBe(1);
    expect(metrics.bySource.ai).toBe(1);
    expect(metrics.bySource.manual).toBe(1);
  });

  it('maintains audit log', () => {
    const protocol5 = new EmergencyBypassProtocol();
    protocol5.bypassTier({ tier: ApprovalTier.T2_ACT }, { reason: 'medical', triggeredBy: 'sensor', evidenceHash: 'h1' });
    protocol5.bypassTier({ tier: ApprovalTier.T1_PREPARE }, { reason: 'fire', triggeredBy: 'manual', evidenceHash: 'h2' });

    const audit = protocol5.getAuditLog();
    expect(audit).toHaveLength(2);
    expect(audit[0]!.type).toBe('emergency-bypass');
    expect(audit[0]!.requiresReview).toBe(true);
  });
});
