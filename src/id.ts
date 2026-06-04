/**
 * Record IDs (SPEC §6.2). `urn:amp:<id>` where <id> is either a random 128-bit
 * base32 string (L1) or the content hash (L2+, content-addressed → dedup-friendly).
 */

import { randomBytes } from "node:crypto";
import { base32nopad } from "@scure/base";
import { contentHash } from "./integrity.ts";
import type { MemoryRecord } from "./types.ts";

export function randomId(): string {
  return "urn:amp:" + base32nopad.encode(randomBytes(16)).toLowerCase();
}

/** Content-addressed id derived from the record's BLAKE3 hash. */
export function contentId(record: MemoryRecord): string {
  const hash = contentHash(record); // "blake3:<b32>"
  return "urn:amp:" + hash.slice(hash.indexOf(":") + 1);
}

export function isOmpId(value: string): boolean {
  return /^urn:amp:[a-z2-7]+$/.test(value);
}
