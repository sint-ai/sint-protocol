import { createHash } from 'crypto';

export type ActionCategory = 'medical' | 'security' | 'public-safety' | 'infrastructure' | 'governance' | 'other';

export interface ActionRecord {
  category: ActionCategory;
  timestamp: Date;
  details: string;
  success: boolean;
}

export interface JudicialOverride {
  overrideId: string;
  reason: string;
  issuedBy: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface AccountabilityToken {
  id: string;
  officialDID: string;
  officialTitle: string;
  jurisdiction: string;
  createdAt: Date;
  actionHistory: ActionRecord[];
  auditTrail: string[];
  judicialOverrides: JudicialOverride[];
  riskScore: number;
}

export class AccountabilityTokenManager {
  private tokens = new Map<string, AccountabilityToken>();

  createToken(officialDID: string, officialTitle: string, jurisdiction: string): AccountabilityToken {
    const token: AccountabilityToken = {
      id: `accountability-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      officialDID,
      officialTitle,
      jurisdiction,
      createdAt: new Date(),
      actionHistory: [],
      auditTrail: [],
      judicialOverrides: [],
      riskScore: 0,
    };

    this.tokens.set(token.id, token);
    return token;
  }

  recordAction(tokenId: string, category: ActionCategory, details: string, success: boolean): void {
    const token = this.tokens.get(tokenId);
    if (!token) throw new Error(`Token ${tokenId} not found`);

    const action: ActionRecord = {
      category,
      timestamp: new Date(),
      details,
      success,
    };

    token.actionHistory.push(action);

    // Calculate risk score
    const failurePoints = !success ? 5 : 0;
    const highRiskPoints = ['security', 'public-safety', 'infrastructure'].includes(category) ? 3 : 0;
    const overridePoints = token.judicialOverrides.filter((o) => o.expiresAt > new Date()).length * 10;

    token.riskScore += failurePoints + highRiskPoints + overridePoints;

    // Log to audit trail
    const auditEntry = this.createAuditEntry(action, token);
    token.auditTrail.push(auditEntry);
  }

  getActionHistory(tokenId: string, category?: ActionCategory): ActionRecord[] {
    const token = this.tokens.get(tokenId);
    if (!token) return [];

    if (category) {
      return token.actionHistory.filter((a) => a.category === category);
    }
    return token.actionHistory;
  }

  recordJudicialOverride(tokenId: string, reason: string, issuedBy: string, durationDays: number = 30): void {
    const token = this.tokens.get(tokenId);
    if (!token) throw new Error(`Token ${tokenId} not found`);

    const override: JudicialOverride = {
      overrideId: `override-${Date.now()}`,
      reason,
      issuedBy,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + durationDays * 24 * 3600000),
    };

    token.judicialOverrides.push(override);
    token.riskScore += 10; // Judicial overrides increase risk
  }

  isOverridden(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) return false;

    return token.judicialOverrides.some((o) => o.expiresAt > new Date());
  }

  getPublicAudit(tokenId: string): Array<{ category: ActionCategory; timestamp: Date; success: boolean }> {
    const token = this.tokens.get(tokenId);
    if (!token) return [];

    return token.actionHistory.map((a) => ({
      category: a.category,
      timestamp: a.timestamp,
      success: a.success,
    }));
  }

  exportForTransparency(tokenId: string): { official: string; title: string; actions: number; riskScore: number } {
    const token = this.tokens.get(tokenId);
    if (!token) throw new Error(`Token ${tokenId} not found`);

    return {
      official: this.anonymizeId(token.officialDID),
      title: token.officialTitle,
      actions: token.actionHistory.length,
      riskScore: token.riskScore,
    };
  }

  verifyIntegrity(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) return false;

    // Verify audit trail chain
    for (let i = 1; i < token.auditTrail.length; i++) {
      const prevHash = token.auditTrail[i - 1]!.substring(0, 16);
      const currentEntry = token.auditTrail[i]!;
      if (!currentEntry.includes(prevHash)) {
        return false;
      }
    }

    return true;
  }

  calculateRiskScore(tokenId: string): number {
    const token = this.tokens.get(tokenId);
    if (!token) return 0;

    let score = 0;

    // Factor 1: Failed actions
    const failedActions = token.actionHistory.filter((a) => !a.success).length;
    score += failedActions * 5;

    // Factor 2: High-risk action count
    const highRiskActions = token.actionHistory.filter((a) =>
      ['security', 'public-safety', 'infrastructure'].includes(a.category),
    ).length;
    score += highRiskActions * 3;

    // Factor 3: Active judicial overrides
    const activeOverrides = token.judicialOverrides.filter((o) => o.expiresAt > new Date()).length;
    score += activeOverrides * 10;

    return score;
  }

  private createAuditEntry(action: ActionRecord, token: AccountabilityToken): string {
    const data = `${action.category}:${action.timestamp.toISOString()}:${action.success}:${token.officialDID}`;
    const hash = createHash('sha256').update(data).digest('hex');
    const previousHash = token.auditTrail.length > 0 ? token.auditTrail[token.auditTrail.length - 1]!.substring(0, 16) : '0';
    return `${hash}:${previousHash}:${action.category}`;
  }

  private anonymizeId(id: string): string {
    return createHash('sha256').update(id).digest('hex').substring(0, 8);
  }

  getToken(tokenId: string): AccountabilityToken | undefined {
    return this.tokens.get(tokenId);
  }
}
