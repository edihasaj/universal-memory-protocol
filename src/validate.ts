/**
 * Lightweight structural validation of a Memory Record against the UMP 0.1
 * constraints (SPEC §2). Dependency-free - checks the same invariants the JSON
 * Schema encodes (src/schema/ump-record.schema.json) without a schema engine.
 *
 * Returns the list of problems; empty = valid.
 */

import {
  UMP_VERSION,
  type MemoryDraft,
  type MemoryKind,
  type Visibility,
} from "./types.ts";

const KINDS: MemoryKind[] = ["semantic", "episodic", "procedural", "working", "identity"];
const VIS: Visibility[] = ["private", "shared", "public"];
const STATUS = ["active", "candidate", "tombstoned"];
const ACTOR_KINDS = ["user", "agent", "model", "import", "scan"];

export function validateDraft(d: MemoryDraft): string[] {
  const errs: string[] = [];
  const req = (cond: unknown, msg: string) => { if (!cond) errs.push(msg); };

  if (d.ump !== undefined && d.ump !== UMP_VERSION) errs.push(`ump version must be ${UMP_VERSION}`);
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
  return errs;
}

export function isValidDraft(d: MemoryDraft): boolean {
  return validateDraft(d).length === 0;
}
