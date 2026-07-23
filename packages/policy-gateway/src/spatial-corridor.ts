/**
 * SINT Protocol — Static spatial corridor verifier.
 *
 * Reference implementation for PolicyGateway spatial mission envelopes. It
 * verifies local-frame corridor polygons and optional centerline/heading facts
 * before the gateway compares those facts against token limits.
 */

import type {
  GeoPolygon,
  SintCapabilityToken,
  SintRequest,
} from "@pshkv/core";
import { isPointInPolygon } from "@pshkv/gate-capability-tokens";
import type { SpatialCorridorVerifierPlugin } from "./gateway.js";

export interface CorridorPoint {
  readonly x: number;
  readonly y: number;
}

export interface StaticCorridorGeometry {
  /** Local-frame polygon for the authorized corridor/zone. */
  readonly polygon: GeoPolygon;
  /** Optional route centerline used to compute lateral deviation. */
  readonly centerline?: readonly CorridorPoint[];
  /** Optional nominal travel heading used to compute heading deviation. */
  readonly nominalHeadingDeg?: number;
  /** Optional evidence/verifier reference emitted with decisions. */
  readonly verifierRef?: string;
}

export type StaticCorridorResolver =
  | Readonly<Record<string, StaticCorridorGeometry>>
  | ((corridorId: string, request: SintRequest, token: SintCapabilityToken) => StaticCorridorGeometry | undefined);

export class StaticSpatialCorridorVerifier implements SpatialCorridorVerifierPlugin {
  private readonly resolver: StaticCorridorResolver;

  constructor(resolver: StaticCorridorResolver) {
    this.resolver = resolver;
  }

  async verifyCorridor(
    request: SintRequest,
    token: SintCapabilityToken,
  ): Promise<{
    readonly verified: boolean;
    readonly insideCorridor?: boolean;
    readonly lateralDeviationMeters?: number;
    readonly headingDeviationDeg?: number;
    readonly verifierRef?: string;
    readonly reason?: string;
  }> {
    const corridorId = token.executionEnvelope?.corridorId
      ?? request.executionContext?.preapprovedCorridor?.corridorId;
    if (!corridorId) {
      return { verified: false, reason: "missing corridorId" };
    }

    const geometry = this.resolve(corridorId, request, token);
    if (!geometry) {
      return { verified: false, reason: `unknown corridor ${corridorId}` };
    }

    const position = request.physicalContext?.currentPosition;
    if (!position) {
      return { verified: false, reason: "missing currentPosition" };
    }

    const point = { x: position.x, y: position.y };
    const insideCorridor = isPointInPolygon(point, geometry.polygon);
    const lateralDeviationMeters = geometry.centerline
      ? distanceToPolyline(point, geometry.centerline)
      : undefined;
    const headingDeviationDeg =
      geometry.nominalHeadingDeg !== undefined && request.physicalContext?.currentHeadingDeg !== undefined
        ? angleDeltaDeg(request.physicalContext.currentHeadingDeg, geometry.nominalHeadingDeg)
        : undefined;

    return {
      verified: true,
      insideCorridor,
      ...(lateralDeviationMeters !== undefined ? { lateralDeviationMeters } : {}),
      ...(headingDeviationDeg !== undefined ? { headingDeviationDeg } : {}),
      verifierRef: geometry.verifierRef ?? `static-corridor:${corridorId}`,
      ...(!insideCorridor ? { reason: "position outside corridor polygon" } : {}),
    };
  }

  private resolve(
    corridorId: string,
    request: SintRequest,
    token: SintCapabilityToken,
  ): StaticCorridorGeometry | undefined {
    if (typeof this.resolver === "function") {
      return this.resolver(corridorId, request, token);
    }
    return this.resolver[corridorId];
  }
}

function distanceToPolyline(point: CorridorPoint, line: readonly CorridorPoint[]): number {
  if (line.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (line.length === 1) {
    return distance(point, line[0]!);
  }
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i += 1) {
    min = Math.min(min, distanceToSegment(point, line[i]!, line[i + 1]!));
  }
  return min;
}

function distanceToSegment(point: CorridorPoint, a: CorridorPoint, b: CorridorPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return distance(point, a);
  }
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

function distance(a: CorridorPoint, b: CorridorPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDeltaDeg(a: number, b: number): number {
  const delta = ((((a - b) % 360) + 540) % 360) - 180;
  return Math.abs(delta);
}
