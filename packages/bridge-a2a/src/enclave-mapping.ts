/**
 * Enclave (AgentNexus) ↔ SINT Protocol capability token mapping
 *
 * Maps Enclave's permission model (admin|member|viewer + Playbook stage constraints)
 * to SINT capability tokens (T0-T3 tier system + ConstraintEnvelope).
 *
 * Ref: A2A#1716, SINT RFC-001, AgentNexus Enclave spec
 * Co-authored with @kevinkaylie (AgentNexus)
 */

export type EnclaveRole = 'admin' | 'member' | 'viewer';
export type SintTier = 'T0' | 'T1' | 'T2' | 'T3';
export type VersionBinding = 'capability' | 'exact';

/** Enclave Playbook stage permission shape */
export interface EnclavePermission {
  role: EnclaveRole;
  input_keys: string[];
  output_key: string;
  version_binding: VersionBinding;
  /** Optional: resolved stage name for audit trail */
  stage_name?: string;
  /** Optional: Enclave owner DID for delegation chain root */
  owner_did?: string;
}

/** SINT capability token (RFC-001 §3.1 compatible) */
export interface SintCapabilityToken {
  subject: string;           // agent DID
  resource: string;          // skill URI (a2a://host/skills/name)
  actions: string[];         // ['invoke'] | ['observe']
  tier: SintTier;
  constraints: SintConstraints;
  exp: number;               // Unix timestamp
  delegation_chain?: string; // parent token ID for monotonic narrowing
}

export interface SintConstraints {
  input_keys: string[];
  output_key: string;
  version_binding: VersionBinding;
  /** Enclave-specific: stage the token was issued for */
  enclave_stage?: string;
  /** MolTrust trust score floor (0-100), applied at gateway */
  trust_threshold?: number;
}

/**
 * Enclave role → SINT tier mapping
 *
 * admin  → T2: operator approval required (consequential, can modify state)
 * member → T1: auto-execute (task execution, standard Playbook participant)
 * viewer → T0: observe only (no writes, no invocations)
 *
 * Note: T3 (human sign-off, irreversible) is not reachable via role alone —
 * it requires explicit escalation in the Playbook definition.
 */
const ROLE_TO_TIER: Record<EnclaveRole, SintTier> = {
  admin: 'T2',
  member: 'T1',
  viewer: 'T0',
};

const TIER_TO_ROLE: Record<SintTier, EnclaveRole> = {
  T0: 'viewer',
  T1: 'member',
  T2: 'admin',
  T3: 'admin', // T3 maps to admin role but requires additional human approval gate
};

/**
 * Convert an Enclave permission to a SINT capability token.
 *
 * Monotonic narrowing is preserved: the resulting SINT token cannot
 * exceed the scope of the Enclave permission it was derived from.
 */
export function enclaveToSint(
  permission: EnclavePermission,
  agentDid: string,
  skillUri: string,
  ttlSeconds = 3600,
  parentTokenId?: string,
): SintCapabilityToken {
  const tier = ROLE_TO_TIER[permission.role];

  return {
    subject: agentDid,
    resource: skillUri,
    actions: tier === 'T0' ? ['observe'] : ['invoke'],
    tier,
    constraints: {
      input_keys: permission.input_keys,
      output_key: permission.output_key,
      version_binding: permission.version_binding,
      ...(permission.stage_name ? { enclave_stage: permission.stage_name } : {}),
    },
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    ...(parentTokenId ? { delegation_chain: parentTokenId } : {}),
  };
}

/**
 * Convert a SINT capability token back to an Enclave permission shape.
 * Used when an Enclave-originated agent receives a SINT-issued token.
 */
export function sintToEnclave(token: SintCapabilityToken): EnclavePermission {
  return {
    role: TIER_TO_ROLE[token.tier],
    input_keys: token.constraints.input_keys,
    output_key: token.constraints.output_key,
    version_binding: token.constraints.version_binding,
    stage_name: token.constraints.enclave_stage,
  };
}

/**
 * Validate that a child token is a strict subset of its parent.
 * Enforces monotonic narrowing across the Enclave→SINT boundary.
 *
 * Returns true if the child permission is valid (narrows or equals parent).
 * Returns false if the child attempts to escalate beyond the parent scope.
 */
export function validateMonotonicNarrowing(
  parent: EnclavePermission,
  child: SintCapabilityToken,
): { valid: boolean; reason?: string } {
  const parentTier = ROLE_TO_TIER[parent.role];
  const tierOrder: SintTier[] = ['T0', 'T1', 'T2', 'T3'];

  if (tierOrder.indexOf(child.tier) > tierOrder.indexOf(parentTier)) {
    return {
      valid: false,
      reason: `Child tier ${child.tier} exceeds parent tier ${parentTier}`,
    };
  }

  const invalidKeys = child.constraints.input_keys.filter(
    (k) => !parent.input_keys.includes(k),
  );
  if (invalidKeys.length > 0) {
    return {
      valid: false,
      reason: `Child requests input_keys not in parent scope: ${invalidKeys.join(', ')}`,
    };
  }

  return { valid: true };
}
