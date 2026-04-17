/**
 * Canonical JSON serialization for SINT signing and hashing flows.
 *
 * This is intentionally strict:
 * - object keys are serialized in lexicographic order
 * - arrays preserve order
 * - non-finite numbers are rejected
 * - only JSON-compatible values are accepted
 *
 * The output is stable across insertion order and suitable for hashing/signing.
 */

function assertJsonCompatible(value: unknown): void {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    throw new TypeError("canonicalJsonStringify only accepts JSON-compatible values");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("canonicalJsonStringify does not permit non-finite numbers");
  }
}

function canonicalize(value: unknown): string {
  assertJsonCompatible(value);

  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
      .join(",")}}`;
  }

  throw new TypeError("canonicalJsonStringify only accepts JSON-compatible values");
}

export function canonicalJsonStringify(value: unknown): string {
  return canonicalize(value);
}
