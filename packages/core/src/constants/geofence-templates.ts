/**
 * Pre-built geofence templates for common deployment scenarios.
 * All coordinates are [longitude, latitude] pairs (GeoJSON convention).
 * For local robot-frame geofences, treat longitude as X (metres) and
 * latitude as Y (metres) from the origin.
 */

/**
 * Approximate an N-point polygon for a circle of given radius (metres).
 * Produces [x, y] pairs suitable as [longitude, latitude] in local frame.
 */
function circlePolygon(
  radiusM: number,
  points: number,
): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (2 * Math.PI * i) / points;
    coords.push([
      parseFloat((radiusM * Math.cos(angle)).toFixed(4)),
      parseFloat((radiusM * Math.sin(angle)).toFixed(4)),
    ]);
  }
  return coords;
}

/**
 * Library of reusable geofence polygons for common physical-AI deployments.
 * Each entry is a `{ coordinates }` shape that can be dropped straight into
 * a `SintPhysicalConstraints.geofence` field.
 *
 * Coordinates are `[x, y]` pairs in metres relative to the local frame origin.
 * For GPS-based deployments, supply your own GeoJSON-convention polygon instead.
 *
 * @example
 * ```ts
 * import { GEOFENCE_TEMPLATES } from "@pshkv/core";
 *
 * const token = await issueCapabilityToken({
 *   // ...
 *   constraints: { geofence: GEOFENCE_TEMPLATES.WAREHOUSE_BAY_10M },
 * }, issuerKey);
 * ```
 */
export const GEOFENCE_TEMPLATES = {
  /**
   * Standard warehouse bay: 10 m × 10 m square.
   * Origin at centre. Corners at ±5 m.
   */
  WAREHOUSE_BAY_10M: {
    coordinates: [
      [-5, -5],
      [5, -5],
      [5, 5],
      [-5, 5],
      [-5, -5],
    ] as [number, number][],
  },

  /**
   * Robot arm workspace: 1.5 m radius circle approximated as 8-point polygon.
   * Origin at base of arm.
   */
  ROBOT_ARM_1_5M: {
    coordinates: circlePolygon(1.5, 8),
  },

  /**
   * Hospital corridor: 20 m × 3 m lane.
   * Origin at one end, centred on width.
   */
  HOSPITAL_CORRIDOR: {
    coordinates: [
      [0, -1.5],
      [20, -1.5],
      [20, 1.5],
      [0, 1.5],
      [0, -1.5],
    ] as [number, number][],
  },

  /**
   * Outdoor AMR zone: 100 m × 100 m square.
   * Origin at centre.
   */
  OUTDOOR_AMR_100M: {
    coordinates: [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
      [-50, -50],
    ] as [number, number][],
  },
} as const;

/**
 * Union of the keys in `GEOFENCE_TEMPLATES`. Useful for configuration
 * surfaces where an operator picks a named template rather than supplying
 * raw coordinates.
 */
export type GeofenceTemplateName = keyof typeof GEOFENCE_TEMPLATES;
