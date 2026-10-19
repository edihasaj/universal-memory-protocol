import type {
  AuditActor,
  MemoryDraft,
  MemoryRecord,
  Provenance,
} from "./types.ts";

export function actorOf(provenance?: Provenance): AuditActor | undefined {
  if (!provenance?.actor) return undefined;
  return { did: provenance.actor, kind: provenance.actor_kind };
}

export function stampProvenance(
  prior: MemoryRecord,
  actor: AuditActor | undefined,
  method: string,
): Provenance | undefined {
  if (!actor?.did) return prior.provenance;
  return {
    actor: actor.did,
    actor_kind: actor.kind ?? "user",
    method,
    source: { ref: prior.id },
    ...(prior.provenance?.evidence ? { evidence: prior.provenance.evidence } : {}),
  };
}

/** An empty `time` object is deliberately treated as an explicit assertion. */
export function draftHasExplicitTime(draft: MemoryDraft): boolean {
  return draft.time !== undefined;
}

export function scopeMatches(
  filter: Partial<MemoryRecord["scope"]> | undefined,
  scope: MemoryRecord["scope"],
): boolean {
  if (!filter) return true;
  return (Object.keys(filter) as (keyof MemoryRecord["scope"])[]).every(
    (key) => filter[key] === undefined || filter[key] === scope[key],
  );
}

/** A backend-assigned id invalidates any signature over the original id. */
export function withCanonicalId(record: MemoryRecord, id: string): MemoryRecord {
  return id === record.id ? record : { ...record, id, integrity: undefined };
}
