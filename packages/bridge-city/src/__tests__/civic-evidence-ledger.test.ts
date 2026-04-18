import { describe, it, expect } from 'vitest';
import { CivicEvidenceLedger } from '../civic-evidence-ledger';

describe('CivicEvidenceLedger', () => {
  const ledger = new CivicEvidenceLedger();

  it('adds entry to ledger', () => {
    const entry = ledger.addEntry({
      actionType: 'traffic-signal',
      actor: 'system-1',
      resource: 'signal-001',
      timestamp: new Date(),
      tier: 'T1',
    });

    expect(entry.actionType).toBe('traffic-signal');
    expect(entry.previousHash).toBe('0');
    expect(entry.hash).toBeDefined();
  });

  it('creates hash chain', () => {
    const ledger2 = new CivicEvidenceLedger();
    const entry1 = ledger2.addEntry({
      actionType: 'action-1',
      actor: 'actor-1',
      resource: 'resource-1',
      timestamp: new Date(),
      tier: 'T0',
    });

    const entry2 = ledger2.addEntry({
      actionType: 'action-2',
      actor: 'actor-2',
      resource: 'resource-2',
      timestamp: new Date(),
      tier: 'T1',
    });

    expect(entry2.previousHash).toBe(entry1.hash);
  });

  it('verifies chain integrity when valid', () => {
    const ledger3 = new CivicEvidenceLedger();
    ledger3.addEntry({
      actionType: 'action-1',
      actor: 'actor-1',
      resource: 'resource-1',
      timestamp: new Date(),
      tier: 'T0',
    });

    ledger3.addEntry({
      actionType: 'action-2',
      actor: 'actor-2',
      resource: 'resource-2',
      timestamp: new Date(),
      tier: 'T1',
    });

    expect(ledger3.verifyIntegrity()).toBe(true);
  });

  it('retrieves entries by actor', () => {
    const ledger4 = new CivicEvidenceLedger();
    ledger4.addEntry({
      actionType: 'action-1',
      actor: 'actor-1',
      resource: 'resource-1',
      timestamp: new Date(),
      tier: 'T0',
    });

    ledger4.addEntry({
      actionType: 'action-2',
      actor: 'actor-1',
      resource: 'resource-2',
      timestamp: new Date(),
      tier: 'T1',
    });

    const entries = ledger4.getEntriesByActor('actor-1');
    expect(entries).toHaveLength(2);
  });

  it('retrieves entries by resource', () => {
    const ledger5 = new CivicEvidenceLedger();
    const timestamp = new Date();

    ledger5.addEntry({
      actionType: 'action-1',
      actor: 'actor-1',
      resource: 'resource-1',
      timestamp,
      tier: 'T0',
    });

    ledger5.addEntry({
      actionType: 'action-2',
      actor: 'actor-2',
      resource: 'resource-1',
      timestamp,
      tier: 'T1',
    });

    const entries = ledger5.getEntriesByResource('resource-1');
    expect(entries).toHaveLength(2);
  });

  it('exports public audit', () => {
    const ledger6 = new CivicEvidenceLedger();
    ledger6.addEntry({
      actionType: 'traffic-signal',
      actor: 'system-1',
      resource: 'signal-001',
      timestamp: new Date(),
      tier: 'T1',
    });

    const audit = ledger6.exportPublicAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actionType).toBe('traffic-signal');
  });

  it('exports for FOIA', () => {
    const ledger7 = new CivicEvidenceLedger();
    const timestamp = new Date();

    ledger7.addEntry({
      actionType: 'action-1',
      actor: 'actor-1',
      resource: 'resource-1',
      timestamp,
      tier: 'T0',
    });

    const foiaExport = ledger7.exportForFOIA();
    expect(foiaExport).toHaveLength(1);
    expect(foiaExport[0]!.anonymizedActor).toBeDefined();
  });

  it('exports FOIA data since specific date', () => {
    const ledger8 = new CivicEvidenceLedger();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600000);

    ledger8.addEntry({
      actionType: 'action-1',
      actor: 'actor-1',
      resource: 'resource-1',
      timestamp: yesterday,
      tier: 'T0',
    });

    ledger8.addEntry({
      actionType: 'action-2',
      actor: 'actor-2',
      resource: 'resource-2',
      timestamp: now,
      tier: 'T1',
    });

    const foiaExport = ledger8.exportForFOIA(yesterday);
    expect(foiaExport.length).toBeGreaterThan(0);
  });

  it('calculates statistics', () => {
    const ledger9 = new CivicEvidenceLedger();
    ledger9.addEntry({
      actionType: 'action-1',
      actor: 'actor-1',
      resource: 'resource-1',
      timestamp: new Date(),
      tier: 'T0',
    });

    ledger9.addEntry({
      actionType: 'action-2',
      actor: 'actor-2',
      resource: 'resource-2',
      timestamp: new Date(),
      tier: 'T1',
    });

    const stats = ledger9.getStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.uniqueActors).toBe(2);
    expect(stats.uniqueResources).toBe(2);
    expect(stats.dateRange).toBeDefined();
  });

  it('handles empty ledger verification', () => {
    const ledger10 = new CivicEvidenceLedger();
    expect(ledger10.verifyIntegrity()).toBe(true);
  });
});
