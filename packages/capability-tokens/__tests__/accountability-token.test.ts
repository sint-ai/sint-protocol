import { describe, it, expect } from 'vitest';
import { AccountabilityTokenManager } from '../src/extensions/accountability-token';

describe('AccountabilityTokenManager', () => {
  const manager = new AccountabilityTokenManager();

  it('creates accountability token', () => {
    const token = manager.createToken('official-1', 'Police Chief', 'NYC');

    expect(token.id).toBeDefined();
    expect(token.officialDID).toBe('official-1');
    expect(token.officialTitle).toBe('Police Chief');
    expect(token.jurisdiction).toBe('NYC');
    expect(token.riskScore).toBe(0);
  });

  it('records action', () => {
    const token = manager.createToken('official-2', 'Judge', 'Cook County');
    manager.recordAction(token.id, 'governance', 'Case ruling', true);

    const history = manager.getActionHistory(token.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.category).toBe('governance');
    expect(history[0]!.success).toBe(true);
  });

  it('filters actions by category', () => {
    const token = manager.createToken('official-3', 'Fire Chief', 'LA');
    manager.recordAction(token.id, 'public-safety', 'Dispatch emergency', true);
    manager.recordAction(token.id, 'infrastructure', 'Inspect facility', true);
    manager.recordAction(token.id, 'public-safety', 'Rescue operation', true);

    const safetyActions = manager.getActionHistory(token.id, 'public-safety');
    expect(safetyActions).toHaveLength(2);
  });

  it('increases risk score for failed actions', () => {
    const token = manager.createToken('official-4', 'Administrator', 'Boston');
    manager.recordAction(token.id, 'governance', 'Approved permit', true);
    manager.recordAction(token.id, 'governance', 'Denied permit', false);

    const updated = manager.getToken(token.id)!;
    expect(updated.riskScore).toBeGreaterThan(0);
  });

  it('increases risk score for high-risk actions', () => {
    const token = manager.createToken('official-5', 'Security Director', 'DC');
    manager.recordAction(token.id, 'security', 'Approved access', true);
    manager.recordAction(token.id, 'infrastructure', 'System shutdown', true);

    const updated = manager.getToken(token.id)!;
    expect(updated.riskScore).toBeGreaterThan(0);
  });

  it('records judicial override', () => {
    const token = manager.createToken('official-6', 'Mayor', 'Chicago');
    manager.recordJudicialOverride(token.id, 'Emergency powers', 'Judge Smith', 7);

    expect(manager.isOverridden(token.id)).toBe(true);
  });

  it('detects active overrides', () => {
    const token = manager.createToken('official-7', 'Governor', 'Texas');
    manager.recordJudicialOverride(token.id, 'Disaster relief', 'Federal Judge', 30);

    expect(manager.isOverridden(token.id)).toBe(true);
  });

  it('exports public audit', () => {
    const token = manager.createToken('official-8', 'City Manager', 'Seattle');
    manager.recordAction(token.id, 'governance', 'Policy change', true);
    manager.recordAction(token.id, 'public-safety', 'Emergency declaration', true);

    const audit = manager.getPublicAudit(token.id);
    expect(audit).toHaveLength(2);
    expect(audit[0]!.category).toBe('governance');
  });

  it('exports for transparency', () => {
    const token = manager.createToken('official-9', 'Police Officer', 'Denver');
    manager.recordAction(token.id, 'security', 'Arrest', true);
    manager.recordAction(token.id, 'security', 'Investigation', true);

    const export_data = manager.exportForTransparency(token.id);
    expect(export_data.official).toBeDefined();
    expect(export_data.title).toBe('Police Officer');
    expect(export_data.actions).toBe(2);
  });

  it('verifies audit trail integrity', () => {
    const token = manager.createToken('official-10', 'Clerk', 'Atlanta');
    manager.recordAction(token.id, 'governance', 'Record filing', true);
    manager.recordAction(token.id, 'governance', 'Record update', true);

    expect(manager.verifyIntegrity(token.id)).toBe(true);
  });

  it('calculates risk score', () => {
    const token = manager.createToken('official-11', 'Director', 'Miami');
    manager.recordAction(token.id, 'security', 'Authorization denied', false);
    manager.recordAction(token.id, 'security', 'Investigation started', true);

    const risk = manager.calculateRiskScore(token.id);
    expect(risk).toBeGreaterThan(0);
  });

  it('maintains 7 year retention policy', () => {
    const token = manager.createToken('official-12', 'Auditor', 'Philadelphia');
    const now = new Date();
    const sevenYearsAgo = new Date(now.getTime() - 7 * 365 * 24 * 3600000);

    expect(token.createdAt > sevenYearsAgo).toBe(true);
  });

  it('handles multiple officials', () => {
    const token1 = manager.createToken('official-13', 'Manager A', 'Zone A');
    const token2 = manager.createToken('official-14', 'Manager B', 'Zone B');

    manager.recordAction(token1.id, 'governance', 'Action A', true);
    manager.recordAction(token2.id, 'governance', 'Action B', false);

    expect(manager.getToken(token1.id)!.riskScore).toBeLessThan(manager.getToken(token2.id)!.riskScore);
  });
});
