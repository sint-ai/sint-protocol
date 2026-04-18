import { ApprovalTier } from '@pshkv/core';

export interface NGSILDEntity {
  id: string;
  type: string;
  location?: { lat: number; lon: number };
  dataProvider?: string;
  dateObserved?: Date;
}

export interface SINTResource {
  uri: string;
  tier: ApprovalTier;
  metadata: Record<string, unknown>;
}

export class FIWAREMapper {
  private readonly fiwareTypeTierMap: Record<string, ApprovalTier> = {
    TrafficFlowObserved: ApprovalTier.T0_OBSERVE,
    AirQualityObserved: ApprovalTier.T0_OBSERVE,
    NoiseObserved: ApprovalTier.T0_OBSERVE,
    CrowdFlowObserved: ApprovalTier.T0_OBSERVE,
    TrafficLight: ApprovalTier.T2_ACT,
    ParkingSpot: ApprovalTier.T2_ACT,
    ParkingLot: ApprovalTier.T1_PREPARE,
    WeatherObserved: ApprovalTier.T0_OBSERVE,
    DeviceStatus: ApprovalTier.T1_PREPARE,
    Camera: ApprovalTier.T0_OBSERVE,
    Sensor: ApprovalTier.T0_OBSERVE,
  };

  mapEntity(entity: NGSILDEntity): SINTResource {
    const tier = this.determineTier(entity.type);

    return {
      uri: `city://${entity.type}/${entity.id}`,
      tier,
      metadata: {
        location: entity.location,
        dataProvider: entity.dataProvider,
        dateObserved: entity.dateObserved,
        entityType: entity.type,
      },
    };
  }

  determineTier(entityType: string): ApprovalTier {
    // Check exact mapping first
    if (this.fiwareTypeTierMap[entityType]) {
      return this.fiwareTypeTierMap[entityType]!;
    }

    // Observation-only entities: T0
    if (entityType.includes('Observed')) {
      return ApprovalTier.T0_OBSERVE;
    }

    // Sensor/monitor devices: T0
    if (entityType.includes('Sensor') || entityType.includes('Observation')) {
      return ApprovalTier.T0_OBSERVE;
    }

    // Cameras with face recognition prohibition: T0
    if (entityType.includes('Camera')) {
      return ApprovalTier.T0_OBSERVE;
    }

    // Default to T1 for unknown types
    return ApprovalTier.T1_PREPARE;
  }

  getComplianceMapping(tier: ApprovalTier): { gdpr: string[]; euAiAct: string[] } {
    const gdprMap: Record<ApprovalTier, string[]> = {
      [ApprovalTier.T0_OBSERVE]: ['Article 5: Data minimization', 'Article 6: Lawful basis'],
      [ApprovalTier.T1_PREPARE]: [
        'Article 5: Data minimization',
        'Article 22: Automated decision-making',
        'Article 24: Controller responsibility',
      ],
      [ApprovalTier.T2_ACT]: [
        'Article 5: Data minimization',
        'Article 22: Automated decision-making',
        'Article 24: Controller responsibility',
        'Article 32: Security measures',
      ],
      [ApprovalTier.T3_COMMIT]: ['Full compliance audit required'],
    };

    const euAiMap: Record<ApprovalTier, string[]> = {
      [ApprovalTier.T0_OBSERVE]: ['Annex I: Minimal risk'],
      [ApprovalTier.T1_PREPARE]: ['Annex II: Limited risk', 'Chapter 2: Transparency obligations'],
      [ApprovalTier.T2_ACT]: ['Annex III: High-risk', 'Chapter 4: Specific requirements'],
      [ApprovalTier.T3_COMMIT]: ['Annex III: High-risk', 'Chapter 6: Governance'],
    };

    return {
      gdpr: gdprMap[tier] || [],
      euAiAct: euAiMap[tier] || [],
    };
  }

  generateFOIAExport(
    actionsLog: Array<{ type: string; actor: string; timestamp: Date; location?: { lat: number; lon: number } }>,
  ): Array<{ type: string; anonymizedActor: string; timestamp: Date; generalizedLocation?: string }> {
    return actionsLog.map((action) => ({
      type: action.type,
      anonymizedActor: this.hashActor(action.actor),
      timestamp: action.timestamp,
      generalizedLocation: action.location ? this.generalizeLocation(action.location) : undefined,
    }));
  }

  private hashActor(actor: string): string {
    const hash = require('crypto').createHash('sha256');
    return hash.update(actor).digest('hex').substring(0, 8);
  }

  private generalizeLocation(location: { lat: number; lon: number }): string {
    // Round to city block level (~100m precision)
    const blockLat = Math.floor(location.lat * 1000) / 1000;
    const blockLon = Math.floor(location.lon * 1000) / 1000;
    return `block_${blockLat}_${blockLon}`;
  }
}
