import { describe, it, expect } from 'vitest';
import { RegulatorExporter, type ExportInput } from '../src/index.js';

const input: ExportInput = {
  customerId: 'acme-001',
  periodStart: 1700000000000,
  periodEnd: 1700000000000 + 30 * 24 * 60 * 60 * 1000,
  incidents: [
    { id: 'inc-1', severity: 'high', resolution: 'mitigated', timestamp: 1700100000000, ledgerHash: '0xabc' },
  ],
  approvals: [
    { id: 'app-1', status: 'approved', approvers: ['u1', 'u2'], timestamp: 1700200000000, ledgerHash: '0xdef' },
  ],
  reliability: { mtbfHours: 720, nines: 3.5, tier: 'production' },
};

describe('RegulatorExporter', () => {
  it('produces a NIST AI RMF bundle with 4 sections', () => {
    const bundle = RegulatorExporter.export(input, 'NIST_AI_RMF');
    expect(bundle.sections.length).toBe(4);
    expect(bundle.sections.map((s) => s.id)).toEqual(['GOVERN', 'MAP', 'MEASURE', 'MANAGE']);
  });

  it('produces ISO/IEC 42001 bundle', () => {
    const bundle = RegulatorExporter.export(input, 'ISO_IEC_42001');
    expect(bundle.sections[0].id).toBe('CLAUSE_4');
  });

  it('produces EU AI Act Article 17 bundle', () => {
    const bundle = RegulatorExporter.export(input, 'EU_AI_ACT_ART17');
    expect(bundle.sections[0].id).toBe('ART17_PARA1');
  });

  it('contentHash verifies original bundle', () => {
    const bundle = RegulatorExporter.export(input, 'NIST_AI_RMF');
    expect(RegulatorExporter.verify(bundle)).toBe(true);
  });

  it('verify fails when sections are tampered', () => {
    const bundle = RegulatorExporter.export(input, 'NIST_AI_RMF');
    bundle.sections[0].body = 'tampered';
    expect(RegulatorExporter.verify(bundle)).toBe(false);
  });
});
