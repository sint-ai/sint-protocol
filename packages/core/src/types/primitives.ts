/**
 * SINT Protocol — Primitive types used across all layers.
 *
 * @module @pshkv/core/types/primitives
 */

/** ISO 8601 timestamp string with microsecond precision in UTC. */
export type ISO8601 = string;

/** Ed25519 public key encoded as hex string. */
export type Ed25519PublicKey = string;

/** Ed25519 signature encoded as hex string. */
export type Ed25519Signature = string;

/** SHA-256 hash encoded as hex string. */
export type SHA256 = string;

/** UUID v7 (time-ordered) string. */
export type UUIDv7 = string;

/** Semantic version string (e.g. "1.2.3"). */
export type SemVer = string;

/** Duration in milliseconds. */
export type DurationMs = number;

/** Force in Newtons. */
export type Newtons = number;

/** Velocity in meters per second. */
export type MetersPerSecond = number;

/**
 * A 2D polygon defined by an array of [longitude, latitude] coordinate pairs.
 * The polygon is implicitly closed (last point connects to first).
 *
 * @example
 * ```ts
 * const warehouseZone: GeoPolygon = {
 *   coordinates: [[-122.4, 37.7], [-122.4, 37.8], [-122.3, 37.8], [-122.3, 37.7]]
 * };
 * ```
 */
export interface GeoPolygon {
  readonly coordinates: ReadonlyArray<readonly [longitude: number, latitude: number]>;
}

/** A 3D point in meters relative to a reference frame. */
export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Result type for operations that can fail.
 * Uses discriminated union instead of exceptions.
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Helper to create a successful Result. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Helper to create a failed Result. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
