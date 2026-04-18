import { ApprovalTier } from '@pshkv/core';
import { createHash } from 'crypto';

export type ConsentPurpose = 'traffic' | 'air-quality' | 'noise' | 'crowd' | 'safety' | 'other';

export interface CitizenConsentToken {
  tokenId: string;
  citizenId: string;
  sensorTypes: string[];
  purposes: ConsentPurpose[];
  approvalTier: ApprovalTier;
  dataRetention: string;
  anonymized: boolean;
  active: boolean;
  createdAt: Date;
  expiresAt: Date;
  signature: string;
}

export class CitizenConsentTokenManager {
  private tokens = new Map<string, CitizenConsentToken>();

  createToken(
    citizenId: string,
    sensorTypes: string[],
    purposes: ConsentPurpose[],
    retentionHours: number = 24,
  ): CitizenConsentToken {
    const purpose = purposes[0] || 'other';
    const approvalTier = this.determineTier(purpose);

    const token: CitizenConsentToken = {
      tokenId: `ct_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      citizenId,
      sensorTypes,
      purposes,
      approvalTier,
      dataRetention: `${retentionHours}h`,
      anonymized: true,
      active: true,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + retentionHours * 3600000),
      signature: '',
    };

    token.signature = this.generateSignature(token);
    this.tokens.set(token.tokenId, token);

    return token;
  }

  private determineTier(purpose: ConsentPurpose): ApprovalTier {
    switch (purpose) {
      case 'safety':
        return ApprovalTier.T2_ACT;
      case 'crowd':
      case 'traffic':
        return ApprovalTier.T1_PREPARE;
      default:
        return ApprovalTier.T0_OBSERVE;
    }
  }

  verifyToken(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) return false;

    return this.isTokenActive(tokenId);
  }

  isTokenActive(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) return false;

    return token.active && token.expiresAt > new Date();
  }

  revokeToken(tokenId: string): void {
    const token = this.tokens.get(tokenId);
    if (token) {
      token.active = false;
    }
  }

  getToken(tokenId: string): CitizenConsentToken | undefined {
    return this.tokens.get(tokenId);
  }

  getUserTokens(citizenId: string): CitizenConsentToken[] {
    return Array.from(this.tokens.values()).filter((t) => t.citizenId === citizenId);
  }

  getActiveTokens(citizenId: string): CitizenConsentToken[] {
    return this.getUserTokens(citizenId).filter((t) => this.isTokenActive(t.tokenId));
  }

  exportForCitizen(citizenId: string): { active: CitizenConsentToken[]; revoked: CitizenConsentToken[] } {
    const userTokens = this.getUserTokens(citizenId);
    return {
      active: userTokens.filter((t) => this.isTokenActive(t.tokenId)),
      revoked: userTokens.filter((t) => !this.isTokenActive(t.tokenId)),
    };
  }

  private generateSignature(token: CitizenConsentToken): string {
    const sortedSensors = [...token.sensorTypes].sort();
    const sortedPurposes = [...token.purposes].sort();
    const signData = `${token.citizenId}:${sortedSensors.join(',')}:${sortedPurposes.join(',')}`;
    return createHash('sha256').update(signData).digest('hex');
  }
}
