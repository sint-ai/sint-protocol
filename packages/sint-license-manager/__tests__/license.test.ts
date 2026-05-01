import { describe, it, expect } from 'vitest';
import { LicenseManager, type License } from '../src/index.js';

const validLicense: License = {
  customerId: 'acme-001',
  tiers: ['core_os', 'compliance_pack'],
  expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
  signature: 'sig',
};

describe('LicenseManager', () => {
  it('grants features within licensed tiers', () => {
    const m = new LicenseManager();
    m.load(validLicense);
    expect(m.hasFeature('agent_runtime')).toBe(true);
    expect(m.hasFeature('drr_tracking')).toBe(true);
  });

  it('denies features not in any licensed tier', () => {
    const m = new LicenseManager();
    m.load(validLicense);
    expect(m.hasFeature('mcp_integration')).toBe(false);
  });

  it('respects expiry', () => {
    const m = new LicenseManager();
    m.load({ ...validLicense, expiresAt: Date.now() - 1000 });
    expect(m.hasFeature('agent_runtime')).toBe(false);
  });

  it('honors feature overrides', () => {
    const m = new LicenseManager();
    m.load({ ...validLicense, featureOverrides: ['mcp_integration'] });
    expect(m.hasFeature('mcp_integration')).toBe(true);
  });

  it('reports days until expiry', () => {
    const m = new LicenseManager();
    m.load(validLicense);
    expect(m.daysUntilExpiry()).toBeGreaterThan(80);
  });

  it('assertFeature throws when feature missing', () => {
    const m = new LicenseManager();
    m.load(validLicense);
    expect(() => m.assertFeature('mcp_integration')).toThrow();
  });
});
