/**
 * SINT bridge-health — Differential Privacy Ledger
 *
 * Privacy-preserving aggregate health queries with epsilon budget tracking.
 * Implements Phase 5 differential privacy per Physical AI Governance
 * Roadmap 2026-2029.
 *
 * @module @pshkv/bridge-health/differential-privacy
 */

import type { HealthKitDataType, DataSensitivity } from "./healthkit-mapper.js";

/**
 * Privacy budget state for a user.
 */
export interface PrivacyBudget {
  /** User DID (data subject) */
  userId: string;
  
  /** Total epsilon budget available */
  totalBudget: number;
  
  /** Epsilon consumed so far */
  consumed: number;
  
  /** Remaining epsilon budget */
  remaining: number;
  
  /** Budget reset period (e.g., monthly) */
  resetPeriod: "daily" | "weekly" | "monthly";
  
  /** Last reset timestamp */
  lastReset: Date;
  
  /** Next reset timestamp */
  nextReset: Date;
}

/**
 * Differential privacy query record.
 */
export interface DPQuery {
  /** Query ID (unique) */
  queryId: string;
  
  /** User DID (data subject) */
  userId: string;
  
  /** Querier DID (who ran the query) */
  querierId: string;
  
  /** Data type queried */
  dataType: HealthKitDataType;
  
  /** Aggregation level */
  aggregation: "hourly" | "daily" | "weekly" | "monthly";
  
  /** Epsilon consumed by this query */
  epsilon: number;
  
  /** Query timestamp */
  timestamp: Date;
  
  /** Sensitivity level */
  sensitivity: DataSensitivity;
  
  /** True answer (before noise) */
  trueAnswer?: number;
  
  /** Noisy answer (after Laplace noise) */
  noisyAnswer: number;
  
  /** Noise added */
  noise: number;
}

/**
 * Differential privacy ledger state.
 */
export interface DPLedgerState {
  /** Privacy budgets by user ID */
  budgets: Map<string, PrivacyBudget>;
  
  /** Query history */
  queries: DPQuery[];
  
  /** Ledger creation timestamp */
  createdAt: Date;
  
  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Differential Privacy Ledger.
 * 
 * Tracks epsilon budget consumption and provides privacy-preserving
 * aggregate queries with Laplace mechanism.
 *
 * @example
 * ```ts
 * const ledger = new DifferentialPrivacyLedger();
 * 
 * // Initialize user budget (10.0 epsilon per month)
 * ledger.initializeBudget('did:key:user123', 10.0, 'monthly');
 * 
 * // Run aggregate query
 * const result = await ledger.query({
 *   userId: 'did:key:user123',
 *   querierId: 'did:key:researcher456',
 *   dataType: 'HKQuantityTypeIdentifierStepCount',
 *   aggregation: 'daily',
 *   epsilon: 0.5,
 *   sensitivity: 'PERSONAL',
 * });
 * 
 * // Check remaining budget
 * const budget = ledger.getBudget('did:key:user123');
 * console.log(`Remaining: ${budget.remaining} epsilon`);
 * ```
 */
export class DifferentialPrivacyLedger {
  private state: DPLedgerState;
  
  constructor() {
    this.state = {
      budgets: new Map(),
      queries: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  
  /**
   * Initialize privacy budget for a user.
   *
   * @param userId - User DID
   * @param totalBudget - Total epsilon budget
   * @param resetPeriod - Budget reset period
   */
  initializeBudget(
    userId: string,
    totalBudget: number,
    resetPeriod: "daily" | "weekly" | "monthly" = "monthly"
  ): void {
    const now = new Date();
    const nextReset = this.computeNextReset(now, resetPeriod);
    
    this.state.budgets.set(userId, {
      userId,
      totalBudget,
      consumed: 0,
      remaining: totalBudget,
      resetPeriod,
      lastReset: now,
      nextReset,
    });
    
    this.state.updatedAt = now;
  }
  
  /**
   * Get privacy budget for a user.
   *
   * @param userId - User DID
   * @returns Privacy budget state
   */
  getBudget(userId: string): PrivacyBudget | null {
    const budget = this.state.budgets.get(userId);
    if (!budget) return null;
    
    // Check if budget needs reset
    const now = new Date();
    if (now >= budget.nextReset) {
      return this.resetBudget(userId);
    }
    
    return budget;
  }
  
  /**
   * Reset privacy budget for a user.
   *
   * @param userId - User DID
   * @returns Updated budget state
   */
  private resetBudget(userId: string): PrivacyBudget {
    const budget = this.state.budgets.get(userId);
    if (!budget) {
      throw new Error(`Budget not initialized for user ${userId}`);
    }
    
    const now = new Date();
    const nextReset = this.computeNextReset(now, budget.resetPeriod);
    
    const updatedBudget: PrivacyBudget = {
      ...budget,
      consumed: 0,
      remaining: budget.totalBudget,
      lastReset: now,
      nextReset,
    };
    
    this.state.budgets.set(userId, updatedBudget);
    this.state.updatedAt = now;
    
    return updatedBudget;
  }
  
  /**
   * Compute next budget reset timestamp.
   */
  private computeNextReset(from: Date, period: "daily" | "weekly" | "monthly"): Date {
    const next = new Date(from);
    
    switch (period) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
    }
    
    return next;
  }
  
  /**
   * Run a differential privacy query.
   *
   * @param params - Query parameters
   * @returns Query result with noisy answer
   */
  async query(params: {
    userId: string;
    querierId: string;
    dataType: HealthKitDataType;
    aggregation: "hourly" | "daily" | "weekly" | "monthly";
    epsilon: number;
    sensitivity: DataSensitivity;
    trueAnswer?: number; // For testing; in production, fetch from data source
  }): Promise<{ success: boolean; noisyAnswer?: number; error?: string }> {
    const { userId, querierId, dataType, aggregation, epsilon, sensitivity, trueAnswer } = params;
    
    // Check budget
    const budget = this.getBudget(userId);
    if (!budget) {
      return {
        success: false,
        error: `Privacy budget not initialized for user ${userId}`,
      };
    }
    
    if (budget.remaining < epsilon) {
      return {
        success: false,
        error: `Insufficient privacy budget. Remaining: ${budget.remaining}, requested: ${epsilon}`,
      };
    }
    
    // Compute sensitivity parameter for Laplace mechanism
    const sensitivityParam = this.computeSensitivity(dataType, aggregation);
    
    // Generate Laplace noise
    const noise = this.laplaceNoise(sensitivityParam / epsilon);
    
    // Add noise to true answer
    // In production, trueAnswer would be fetched from actual data source
    const baseAnswer = trueAnswer ?? 0;
    const noisyAnswer = baseAnswer + noise;
    
    // Record query
    const query: DPQuery = {
      queryId: this.generateQueryId(),
      userId,
      querierId,
      dataType,
      aggregation,
      epsilon,
      timestamp: new Date(),
      sensitivity,
      trueAnswer: baseAnswer,
      noisyAnswer,
      noise,
    };
    
    this.state.queries.push(query);
    
    // Consume budget
    budget.consumed += epsilon;
    budget.remaining -= epsilon;
    this.state.budgets.set(userId, budget);
    this.state.updatedAt = new Date();
    
    return {
      success: true,
      noisyAnswer,
    };
  }
  
  /**
   * Compute sensitivity parameter for a given data type and aggregation.
   * 
   * Sensitivity = maximum change in query result from adding/removing one person.
   *
   * @param dataType - HealthKit data type
   * @param aggregation - Aggregation level
   * @returns Sensitivity parameter
   */
  private computeSensitivity(
    dataType: HealthKitDataType,
    aggregation: "hourly" | "daily" | "weekly" | "monthly"
  ): number {
    // Base sensitivities (approximate)
    const baseSensitivities: Record<string, number> = {
      "HKQuantityTypeIdentifierStepCount": 20000, // Max steps per day
      "HKQuantityTypeIdentifierHeartRate": 220,   // Max heart rate
      "HKQuantityTypeIdentifierBloodPressureSystolic": 200,
      "HKQuantityTypeIdentifierBloodGlucose": 400, // mg/dL
      "HKQuantityTypeIdentifierBodyMass": 500,     // kg
      "HKQuantityTypeIdentifierActiveEnergyBurned": 5000, // kcal
    };
    
    const base = baseSensitivities[dataType] ?? 1000;
    
    // Aggregation multiplier (larger time windows = higher sensitivity)
    const multipliers = {
      hourly: 1,
      daily: 1,
      weekly: 7,
      monthly: 30,
    };
    
    return base * multipliers[aggregation];
  }
  
  /**
   * Generate Laplace noise with scale parameter b.
   * 
   * Laplace(b) has PDF: f(x) = (1/2b) * exp(-|x|/b)
   *
   * @param b - Scale parameter (sensitivity / epsilon)
   * @returns Random sample from Laplace distribution
   */
  private laplaceNoise(b: number): number {
    // Use inverse transform sampling
    const u = Math.random() - 0.5;
    return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }
  
  /**
   * Generate unique query ID.
   */
  private generateQueryId(): string {
    return `dpq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  /**
   * Get query history for a user.
   *
   * @param userId - User DID
   * @param limit - Maximum number of queries to return
   * @returns Query history
   */
  getQueryHistory(userId: string, limit: number = 100): DPQuery[] {
    return this.state.queries
      .filter((q) => q.userId === userId)
      .slice(-limit);
  }
  
  /**
   * Export ledger state for audit.
   * Patient can export this to see all queries against their data.
   *
   * @param userId - User DID
   * @returns Audit export
   */
  exportAudit(userId: string): {
    budget: PrivacyBudget | null;
    queries: DPQuery[];
    totalEpsilonConsumed: number;
    querierBreakdown: Record<string, number>;
  } {
    const budget = this.getBudget(userId);
    const queries = this.getQueryHistory(userId, 1000); // All queries
    
    const totalEpsilonConsumed = queries.reduce((sum, q) => sum + q.epsilon, 0);
    
    // Group by querier
    const querierBreakdown: Record<string, number> = {};
    for (const query of queries) {
      querierBreakdown[query.querierId] = (querierBreakdown[query.querierId] ?? 0) + query.epsilon;
    }
    
    return {
      budget,
      queries,
      totalEpsilonConsumed,
      querierBreakdown,
    };
  }
  
  /**
   * Check if a query would exceed privacy budget.
   *
   * @param userId - User DID
   * @param epsilon - Epsilon to consume
   * @returns true if budget sufficient
   */
  checkBudget(userId: string, epsilon: number): boolean {
    const budget = this.getBudget(userId);
    if (!budget) return false;
    return budget.remaining >= epsilon;
  }
}

/**
 * Create a public audit record for a differential privacy query.
 * Used by Evidence Ledger to record DP queries in public log.
 *
 * @param query - DP query record
 * @returns Public audit entry (no sensitive data)
 */
export function createDPAuditEntry(query: DPQuery): {
  queryId: string;
  timestamp: Date;
  userId: string; // Hashed or pseudonymized in production
  querierId: string;
  dataType: string; // Generic category, not specific type
  aggregation: string;
  epsilon: number;
} {
  return {
    queryId: query.queryId,
    timestamp: query.timestamp,
    userId: hashUserId(query.userId), // Hash user ID for public ledger
    querierId: query.querierId,
    dataType: generalizeDataType(query.dataType),
    aggregation: query.aggregation,
    epsilon: query.epsilon,
  };
}

/**
 * Hash user ID for public audit trail.
 * In production, use cryptographic hash (SHA-256).
 */
function hashUserId(userId: string): string {
  // Placeholder: In production, use crypto.subtle.digest
  return `user-${userId.substring(0, 8)}...`;
}

/**
 * Generalize data type for public audit trail.
 * Maps specific HealthKit types to broad categories.
 */
function generalizeDataType(dataType: HealthKitDataType): string {
  if (dataType.includes("StepCount") || dataType.includes("Distance")) {
    return "Fitness";
  }
  if (dataType.includes("HeartRate")) {
    return "Cardiac";
  }
  if (dataType.includes("BloodPressure") || dataType.includes("BloodGlucose")) {
    return "Vitals";
  }
  if (dataType.includes("Sleep")) {
    return "Sleep";
  }
  return "Other";
}
