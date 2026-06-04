/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 * Used for deterministic hashing/signing of records (SPEC §6.1).
 *
 * Rules: object keys sorted by UTF-16 code unit; no insignificant whitespace;
 * strings escaped per JSON; numbers serialized per ECMAScript Number.toString
 * (sufficient for AMP, which uses integers and simple decimals only).
 */

export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error("canonicalize: non-finite number");
    }
    return String(value);
  }
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map((v) => serialize(v ?? null)).join(",") + "]";
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort(compareCodeUnits);
    const parts = keys.map((k) => JSON.stringify(k) + ":" + serialize(obj[k]));
    return "{" + parts.join(",") + "}";
  }

  throw new Error(`canonicalize: unsupported type ${t}`);
}

function compareCodeUnits(a: string, b: string): number {
  // Native JS string comparison is by UTF-16 code unit — exactly JCS's rule.
  return a < b ? -1 : a > b ? 1 : 0;
}
