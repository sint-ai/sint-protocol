# SINT Protocol Physical AI Governance - Next Priorities

**Current Status:** 30% complete (9 of 30 deliverables)
- ✅ Phase 1: Consumer Smart Home (100% - 4/4 deliverables)
- 🟡 Phase 2: Matter + Human-Aware (67% - 2/3 deliverables)
- ⚪ Phase 3: Edge/Nano (0% - 0/3 deliverables)
- ⚪ Phase 4: HRI Foundation (0% - 0/3 deliverables)
- ✅ Phase 5: Health Fabric (100% - 3/3 deliverables)
- ⚪ Phase 6: Smart City (0% - 0/3 deliverables)
- ⚪ Phase 7: Safety/Emergency (0% - 0/3 deliverables)

---

## Top 5 Immediate Priorities (By Strategic Value)

### 1. 🔴 **MQTT QoS → Tier Mapping** (Score: 20, Phase 2)
**Why Ship Next:** Completes Phase 2 to 100%, low effort, high impact

**What to Build:**
```typescript
// packages/bridge-mqtt/src/qos-tier-mapper.ts

export function mapQoSToTier(qos: 0 | 1 | 2): ApprovalTier {
  switch (qos) {
    case 0: return ApprovalTier.T0_OBSERVE;  // Fire-and-forget
    case 1: return ApprovalTier.T1_SUGGEST;  // At-least-once
    case 2: return ApprovalTier.T2_ACT;      // Exactly-once
  }
}
```

**Deliverables:**
- `packages/bridge-mqtt/` (200-300 LOC)
- QoS 0/1/2 → T0/T1/T2 mapping
- MQTT topic pattern matching
- Integration with existing bridge-iot
- Unit tests

**Effort:** 🟢 LOW (1-2 hours)
**Impact:** ✅ Completes Phase 2 (67% → 100%)
**Strategic Value:** Foundation for industrial IoT

---

### 2. 🟠 **bridge-hri: Multimodal Consent** (Score: 23, Phase 4 - HIGH)
**Why Ship Next:** Highest-scoring incomplete deliverable, novel IP

**What to Build:**
```typescript
// packages/bridge-hri/src/consent-capture.ts

export class MultimodalConsentCapture {
  // Voice consent with on-device STT
  async captureVoiceConsent(audioBuffer: Buffer): Promise<ConsentToken>
  
  // Gesture consent (thumbs up, nod, wave)
  async captureGestureConsent(skeleton: BodyPose): Promise<ConsentToken>
  
  // Gaze consent (sustained eye contact with UI element)
  async captureGazeConsent(eyeTrack: GazePoint[]): Promise<ConsentToken>
  
  // Proxemics (physical distance = consent strength)
  async captureProxemicsConsent(distance: number): Promise<ConsentToken>
}
```

**Deliverables:**
- `packages/bridge-hri/` (800-1,200 LOC)
- Multimodal consent capture (voice, gesture, gaze, proxemics)
- On-device intent parsing (no cloud)
- Evidence hash for audit trail
- Integration with Δ_human for proxemics-based escalation
- Accessibility considerations (non-verbal users)

**Effort:** 🟡 MEDIUM (4-6 hours)
**Impact:** Unlocks eldercare, disability assistance, hands-free robotics
**Strategic Value:** Novel IP, research publication potential

---

### 3. 🟠 **bridge-city: Smart City Governance** (Score: 23, Phase 6 - HIGH)
**Why Ship Next:** Huge market (municipal AI contracts), regulatory demand

**What to Build:**
```typescript
// packages/bridge-city/src/fiware-mapper.ts

export class FIWAREMapper {
  // Map NGSI-LD entities to SINT resources
  mapEntity(entity: NGSILDEntity): SINTResource
  
  // CitizenConsentToken for public sensor data
  createCitizenConsentToken(
    citizenDID: string,
    sensorTypes: string[],
    purpose: 'traffic' | 'air-quality' | 'noise' | 'crowd'
  ): ConsentToken
  
  // Civic Evidence Ledger (public SHA-256 hash chain)
  logCivicAction(action: CivicAction): string  // Returns public hash
}
```

**Deliverables:**
- `packages/bridge-city/` (1,000-1,500 LOC)
- FIWARE/NGSI-LD smart city sensor mesh integration
- CitizenConsentToken implementation
- Civic Evidence Ledger (public audit, privacy-preserving)
- Municipal AI action transparency
- GDPR Article 22 compliance (automated decision-making)

**Effort:** 🟡 MEDIUM-HIGH (6-8 hours)
**Impact:** Opens municipal contracts, EU AI Act compliance showcase
**Strategic Value:** First open protocol for smart city AI governance

---

### 4. 🔴 **Duress Token (DV Protection)** (Score: 22, Phase 7 - HIGH)
**Why Ship Next:** Social impact, vulnerable population protection, novel mechanism

**What to Build:**
```typescript
// packages/gate-capability-tokens/src/duress-token.ts

export class DuressToken extends CapabilityToken {
  // Survivor-only cryptographic key
  survivorKey: string;
  
  // Split control: survivor + trusted third party both required
  trustedPartyKey: string;
  
  // Evidence escrow (encrypted, judicial override only)
  evidenceHash: string;
  evidenceEncryptionKey: string;  // Encrypted with judicial public key
  
  // Duress context detection
  isDuressContext(): boolean;
  
  // Override patterns (e.g., coercion detection)
  detectCoercion(accessPattern: AccessLog[]): boolean;
}
```

**Deliverables:**
- `packages/gate-capability-tokens/src/duress-token.ts` (400-600 LOC)
- Domestic violence protection mechanism
- Survivor-only cryptographic key (abuser cannot revoke)
- Split control architecture (survivor + trusted third party)
- Evidence escrow with judicial override
- Coercion detection (access pattern analysis)
- Integration with smart home devices (locks, cameras, alarms)

**Effort:** 🟡 MEDIUM (4-6 hours)
**Impact:** Protects vulnerable populations, real-world harm reduction
**Strategic Value:** Social impact, press coverage, grants/funding potential

---

### 5. 🟢 **Emergency Bypass Protocol** (Score: 21, Phase 7 - Tier 1)
**Why Ship Next:** Critical safety feature, completes health fabric

**What to Build:**
```typescript
// packages/policy-gateway/src/emergency-bypass.ts

export class EmergencyBypassProtocol {
  // Tier-bypass with cryptographic justification
  async bypassTier(
    action: Action,
    justification: EmergencyJustification
  ): Promise<BypassToken>
  
  // Time-bounded emergency context (auto-expires)
  emergencyContext: {
    triggeredAt: Date;
    expiresAt: Date;  // Max 1 hour
    triggerReason: 'medical' | 'fire' | 'security' | 'fall';
  }
  
  // Mandatory post-hoc audit review
  async logEmergencyBypass(bypass: BypassToken): Promise<AuditEntry>
}
```

**Deliverables:**
- `packages/policy-gateway/src/emergency-bypass.ts` (300-500 LOC)
- Tier-bypass mechanism with cryptographic justification
- Time-bounded emergency context (auto-expires after 1 hour)
- Mandatory post-hoc audit review
- Emergency triggers: medical, fire, security, fall detection
- Integration with bridge-health for medical emergencies

**Effort:** 🟢 LOW-MEDIUM (2-4 hours)
**Impact:** Critical safety feature, unblocks emergency use cases
**Strategic Value:** Completes health fabric for real-world deployment

---

## Strategic Sequencing Recommendation

### Sprint 1: Complete Phase 2 (1-2 hours)
✅ **MQTT QoS Mapping** → Phase 2 hits 100%

**Why:** Quick win, foundational for industrial IoT

### Sprint 2: High-Value Deliverables (10-14 hours)
🔴 **Duress Token** (4-6 hours) → Social impact, press coverage
🟠 **bridge-hri** (4-6 hours) → Novel IP, research publication
🟢 **Emergency Bypass** (2-4 hours) → Critical safety feature

**Why:** Maximum strategic value per hour invested

### Sprint 3: Market Expansion (6-8 hours)
🟠 **bridge-city** (6-8 hours) → Opens municipal market

**Why:** EU AI Act compliance showcase, large contracts

---

## Alternative: Complete Full Phases

### Option A: Complete Phase 2 + Phase 4
- MQTT QoS (1-2 hours)
- bridge-hri (4-6 hours)
- **Result:** 2 more phases at 100% (Phases 2, 4)

### Option B: Complete Phase 7
- Duress Token (4-6 hours)
- Emergency Bypass (2-4 hours)
- Accountability Tokens (3-5 hours)
- **Result:** 1 full phase at 100% (Phase 7)

### Option C: Maximum Strategic Impact
- Duress Token (4-6 hours)
- bridge-hri (4-6 hours)
- bridge-city (6-8 hours)
- **Result:** 3 high-value deliverables, diverse use cases

---

## Completion Timeline Projection

### Current State (30% complete)
- 9 of 30 deliverables shipped
- 2 phases at 100%

### After Top 5 Priorities (47% complete)
- 14 of 30 deliverables shipped
- 3-4 phases at 100% (depends on sequencing)

### Full Roadmap Completion (100%)
- All 30 deliverables shipped
- All 7 phases at 100%
- Estimated total effort: 60-80 hours across all remaining deliverables

---

## Immediate Recommendation

**Ship Next:** 🔴 **MQTT QoS → Tier Mapping**

**Why:**
1. ✅ Quick win (1-2 hours)
2. ✅ Completes Phase 2 to 100%
3. ✅ Foundation for industrial IoT
4. ✅ Low complexity, high confidence
5. ✅ Builds momentum

**Then:** Tackle high-value trio (Duress, HRI, City) for maximum impact

---

## Success Metrics

### After Next 5 Deliverables:
- **Roadmap completion:** 30% → 47%
- **Phases complete:** 2 → 4 (200% increase)
- **New markets unlocked:** Municipal AI, eldercare, DV protection
- **Novel IP created:** Multimodal consent, duress tokens
- **Strategic moats:** Social impact, research publications, EU compliance

---

**Ready to ship. Which priority do you want to tackle first?**

