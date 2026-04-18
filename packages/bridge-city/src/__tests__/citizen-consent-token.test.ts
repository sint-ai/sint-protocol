import { describe, it, expect } from 'vitest';
import { CitizenConsentTokenManager } from '../citizen-consent-token';
import { ApprovalTier } from '@pshkv/core';

describe('CitizenConsentTokenManager', () => {
  const manager = new CitizenConsentTokenManager();

  it('creates citizen consent token', () => {
    const token = manager.createToken('citizen-1', ['camera', 'temperature'], ['traffic']);

    expect(token.citizenId).toBe('citizen-1');
    expect(token.sensorTypes).toContain('camera');
    expect(token.purposes).toContain('traffic');
    expect(token.active).toBe(true);
    expect(token.signature).toBeDefined();
  });

  it('assigns safety purpose to T2_ACT tier', () => {
    const token = manager.createToken('citizen-2', ['alarm'], ['safety']);

    expect(token.approvalTier).toBe(ApprovalTier.T2_ACT);
  });

  it('assigns traffic purpose to T1_PREPARE tier', () => {
    const token = manager.createToken('citizen-3', ['traffic_sensor'], ['traffic']);

    expect(token.approvalTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it('assigns air quality to T0_OBSERVE tier', () => {
    const token = manager.createToken('citizen-4', ['air_sensor'], ['air-quality']);

    expect(token.approvalTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it('verifies valid token', () => {
    const token = manager.createToken('citizen-5', ['sensor'], ['crowd']);

    expect(manager.verifyToken(token.tokenId)).toBe(true);
  });

  it('detects invalid token', () => {
    expect(manager.verifyToken('invalid-token-id')).toBe(false);
  });

  it('checks token activity', () => {
    const token = manager.createToken('citizen-6', ['sensor'], ['other']);

    expect(manager.isTokenActive(token.tokenId)).toBe(true);
  });

  it('revokes token', () => {
    const token = manager.createToken('citizen-7', ['sensor'], ['other']);
    manager.revokeToken(token.tokenId);

    expect(manager.isTokenActive(token.tokenId)).toBe(false);
  });

  it('retrieves user tokens', () => {
    manager.createToken('citizen-8', ['sensor1'], ['traffic']);
    manager.createToken('citizen-8', ['sensor2'], ['air-quality']);

    const tokens = manager.getUserTokens('citizen-8');
    expect(tokens).toHaveLength(2);
  });

  it('filters active tokens', () => {
    const token1 = manager.createToken('citizen-9', ['sensor1'], ['traffic']);
    const token2 = manager.createToken('citizen-9', ['sensor2'], ['air-quality']);

    manager.revokeToken(token1.tokenId);

    const activeTokens = manager.getActiveTokens('citizen-9');
    expect(activeTokens).toHaveLength(1);
    expect(activeTokens[0]!.tokenId).toBe(token2.tokenId);
  });

  it('exports citizen consent data', () => {
    const token1 = manager.createToken('citizen-10', ['sensor1'], ['traffic']);
    const token2 = manager.createToken('citizen-10', ['sensor2'], ['air-quality']);

    manager.revokeToken(token1.tokenId);

    const export1 = manager.exportForCitizen('citizen-10');
    expect(export1.active).toHaveLength(1);
    expect(export1.revoked).toHaveLength(1);
  });

  it('generates consistent signatures for same citizen', () => {
    const token1 = manager.createToken('citizen-11', ['sensor1', 'sensor2'], ['air-quality', 'traffic']);
    const token2 = manager.createToken('citizen-11', ['sensor2', 'sensor1'], ['traffic', 'air-quality']);

    // Same citizen, same sensors and purposes (different order) should generate same signature
    expect(token1.signature).toBe(token2.signature);
  });
});
