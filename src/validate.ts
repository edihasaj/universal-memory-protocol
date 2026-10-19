/**
 * Lightweight structural validation of a Memory Record against the UMP 1.0
 * constraints (SPEC §2). Dependency-free - checks the same invariants the JSON
 * Schema encodes (src/schema/ump-record.schema.json) without a schema engine.
 *
 * Returns the list of problems; empty = valid.
 */

import {
  UMP_VERSION,
  isSupportedUmpVersion,
  type MemoryDraft,
  type MemoryKind,
  type RecallRequest,
  type Visibility,
} from "./types.ts";
import { rfc3339Timestamp } from "./time.ts";

const KINDS: MemoryKind[] = ["semantic", "episodic", "procedural", "working", "identity"];
const VIS: Visibility[] = ["private", "shared", "public"];
const STATUS = ["active", "candidate", "tombstoned"];
const ACTOR_KINDS = ["user", "agent", "model", "import", "scan"];

export function validateDraft(d: MemoryDraft): string[] {
  const errs: string[] = [];
  const req = (cond: unknown, msg: string) => { if (!cond) errs.push(msg); };

  if (d.ump !== undefined && !isSupportedUmpVersion(d.ump)) {
    errs.push(`ump version must be ${UMP_VERSION} or a supported legacy version`);
  }
  req(d.body?.text && typeof d.body.text === "string", "body.text is required");
  req(KINDS.includes(d.kind), `kind must be one of ${KINDS.join("|")}`);
  req(d.scope?.owner, "scope.owner (DID) is required");
  req(d.scope && VIS.includes(d.scope.visibility), `scope.visibility must be ${VIS.join("|")}`);

  if (d.id !== undefined && !/^urn:ump:[a-z2-7]+$/.test(d.id)) {
    errs.push("id must match urn:ump:<base32>");
  }
  if (d.lifecycle?.status && !STATUS.includes(d.lifecycle.status)) {
    errs.push(`lifecycle.status must be ${STATUS.join("|")}`);
  }
  for (const f of ["confidence", "salience"] as const) {
    const n = d.lifecycle?.[f];
    if (n !== undefined && (typeof n !== "number" || n < 0 || n > 1)) {
      errs.push(`lifecycle.${f} must be a number in [0,1]`);
    }
  }
  if (d.provenance) {
    req(d.provenance.actor, "provenance.actor is required when provenance present");
    req(ACTOR_KINDS.includes(d.provenance.actor_kind), `provenance.actor_kind must be ${ACTOR_KINDS.join("|")}`);
    req(d.provenance.method, "provenance.method is required when provenance present");
  }
  if (d.consent?.retention && !/^P/.test(d.consent.retention)) {
    errs.push("consent.retention must be an ISO-8601 duration (starts with P)");
  }
  errs.push(...validateTime(d.time));
  return errs;
}

export function isValidDraft(d: MemoryDraft): boolean {
  return validateDraft(d).length === 0;
}

/** Validate the temporal fields accepted by a `remember` or `revise` input. */
export function validateTime(
  time: MemoryDraft["time"] | undefined,
): string[] {
  if (time === undefined) return [];
  if (
    time === null ||
    typeof time !== "object" ||
    Array.isArray(time) ||
    !isPlainObject(time)
  ) {
    return ["time must be an object"];
  }
  const errs: string[] = [];
  for (const key of ["created", "observed", "valid_from"] as const) {
    if (time[key] !== undefined && rfc3339Timestamp(time[key]) === undefined) {
      errs.push(`time.${key} must be a valid RFC 3339 timestamp with timezone`);
    }
  }
  if (
    time.valid_to !== undefined &&
    time.valid_to !== null &&
    rfc3339Timestamp(time.valid_to) === undefined
  ) {
    errs.push("time.valid_to must be a valid RFC 3339 timestamp with timezone or null");
  }

  const validFrom = time.valid_from === undefined
    ? undefined
    : rfc3339Timestamp(time.valid_from);
  const validTo = time.valid_to === undefined || time.valid_to === null
    ? undefined
    : rfc3339Timestamp(time.valid_to);
  if (validFrom !== undefined && validTo !== undefined && validFrom > validTo) {
    errs.push("time.valid_to must not be before time.valid_from");
  }
  return errs;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Validate the temporal filter accepted by `recall`. */
export function validateRecallRequest(req: RecallRequest): string[] {
  if (
    req.filter?.valid_at !== undefined &&
    rfc3339Timestamp(req.filter.valid_at) === undefined
  ) {
    return ["filter.valid_at must be a valid RFC 3339 timestamp with timezone"];
  }
  return [];
}
