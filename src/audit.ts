/**
 * Audit trail (SPEC §9) - an append-only, hash-chained log of every operation
 * performed against a UMP server: who did what, to which records, when.
 *
 * Design goals, in priority order:
 *  1. Generic. The `AuditLog` interface is what UMP standardizes; the backing
 *     store (memory, file, Postgres, an external SIEM) is an implementation
 *     choice, exactly like `MemoryStore`.
 *  2. Separate from the record. Audit events live in their own log, so adding
 *     auditing never changes the Memory Record shape or the six operations'
 *     output. Enable it or don't; the wire format is identical either way.
 *  3. Tamper-evident. Each event carries the hash of its predecessor (a chain),
 *     so any insertion, deletion, or edit breaks `verify()`. Optionally each
 *     event is Ed25519-signed by the operator key, like records.
 *  4. Scalable. Append is O(1); the interface is streaming-friendly and maps
 *     onto an appended file or an INSERT. `query()` is the only read surface.
 *
 * Auditing is opt-in and orthogonal to conformance: a server enables it by
 * passing an `AuditLog` to `UmpServer`. Reads (`recall`/`get`) are logged too,
 * which per-record provenance cannot capture.
 */

import { blake3 } from "@noble/hashes/blake3";
import { base32nopad } from "@scure/base";
import { canonicalize } from "./canonical.ts";
import { signHash, verifyHash, type KeyPair } from "./integrity.ts";
import { UMP_VERSION, type AuditActor, type MemoryScope } from "./types.ts";

export type { AuditActor };

/** The operations an audit event can record (the six core operations). */
export type AuditOp =
  | "recall"
  | "remember"
  | "get"
  | "revise"
  | "forget"
  | "feedback";

/** One append-only, hash-chained audit record. */
export interface AuditEvent {
  ump: typeof UMP_VERSION;
  /** 1-based monotonic position in the log. */
  seq: number;
  /** ISO-8601 time the event was appended. */
  ts: string;
  op: AuditOp;
  actor?: AuditActor;
  /** Record id(s) written, revised, forgotten, or returned by a read. */
  targets?: string[];
  /** Scope context of the operation (owner/project/...). */
  scope?: Partial<MemoryScope>;
  /** Op outcome, e.g. created | merged | revised | tombstoned | erased | ok. */
  result?: string;
  /** Op-specific detail, e.g. { reason }, { outcome }, { count, query }. */
  meta?: Record<string, unknown>;
  /** Hash of the previous event; null for the first (genesis). */
  prev: string | null;
  /** BLAKE3 over the canonical event minus `hash`/`signature`. */
  hash: string;
  /** Optional Ed25519 signature over `hash` by the operator key. */
  signature?: string;
  signer?: string;
}

/** The caller-supplied part of an event; the log fills seq/ts/prev/hash/sig. */
export type AuditEntry = Pick<
  AuditEvent,
  "op" | "actor" | "targets" | "scope" | "result" | "meta"
>;

export interface AuditQuery {
  op?: AuditOp | AuditOp[];
  /** Filter to a single acting DID. */
  actor?: string;
  /** Filter to events touching a specific record id. */
  target?: string;
  owner?: string;
  project?: string;
  /** ISO time lower/upper bounds (inclusive). */
  since?: string;
  until?: string;
  /** Most-recent-first cap. */
  limit?: number;
}

export interface AuditVerification {
  ok: boolean;
  count: number;
  /** The seq where the chain (or a signature) first fails, if any. */
  brokenAt?: number;
  reason?: string;
}

/** What UMP standardizes for auditing; the backend is an implementation choice. */
export interface AuditLog {
  append(entry: AuditEntry): Promise<AuditEvent>;
  query(q?: AuditQuery): Promise<AuditEvent[]>;
  /** Recompute the hash chain (and signatures, if signed) end to end. */
  verify(): Promise<AuditVerification>;
}

// ── hashing / signing ─────────────────────────────────────────────────────

/** BLAKE3 of the canonical event, excluding the `hash` and `signature` fields. */
export function auditHash(event: Omit<AuditEvent, "hash" | "signature">): string {
  const bytes = new TextEncoder().encode(canonicalize(event));
  return "blake3:" + base32nopad.encode(blake3(bytes)).toLowerCase();
}

function matches(e: AuditEvent, q: AuditQuery): boolean {
  if (q.op) {
    const ops = Array.isArray(q.op) ? q.op : [q.op];
    if (!ops.includes(e.op)) return false;
  }
  if (q.actor && e.actor?.did !== q.actor) return false;
  if (q.target && !(e.targets ?? []).includes(q.target)) return false;
  if (q.owner && e.scope?.owner !== q.owner) return false;
  if (q.project && e.scope?.project !== q.project) return false;
  if (q.since && e.ts < q.since) return false;
  if (q.until && e.ts > q.until) return false;
  return true;
}

/** Shared logic for verifying a materialized, ordered event array. */
function verifyChain(events: AuditEvent[]): AuditVerification {
  let prev: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.seq !== i + 1) {
      return { ok: false, count: events.length, brokenAt: e.seq, reason: "seq gap" };
    }
    if (e.prev !== prev) {
      return { ok: false, count: events.length, brokenAt: e.seq, reason: "broken chain" };
    }
    const { hash, signature, signer, ...rest } = e;
    if (auditHash(rest) !== hash) {
      return { ok: false, count: events.length, brokenAt: e.seq, reason: "hash mismatch" };
    }
    if (signature) {
      if (!signer || !verifyHash(hash, signature, signer)) {
        return { ok: false, count: events.length, brokenAt: e.seq, reason: "bad signature" };
      }
    }
    prev = hash;
  }
  return { ok: true, count: events.length };
}

// ── in-memory reference implementation ─────────────────────────────────────

export interface AuditLogOptions {
  /** Sign each event with the operator key (tamper-evident + attributable). */
  key?: KeyPair;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
}

/** Dependency-free reference audit log: an array + a hash chain. */
export class InMemoryAuditLog implements AuditLog {
  protected events: AuditEvent[] = [];
  private key?: KeyPair;
  private now: () => Date;

  constructor(opts: AuditLogOptions = {}) {
    this.key = opts.key;
    this.now = opts.now ?? (() => new Date());
  }

  /** Build the next chained event without persisting it. */
  protected build(entry: AuditEntry): AuditEvent {
    const prev = this.events.length ? this.events[this.events.length - 1]!.hash : null;
    const base: Omit<AuditEvent, "hash" | "signature" | "signer"> = {
      ump: UMP_VERSION,
      seq: this.events.length + 1,
      ts: this.now().toISOString(),
      op: entry.op,
      ...(entry.actor ? { actor: entry.actor } : {}),
      ...(entry.targets ? { targets: entry.targets } : {}),
      ...(entry.scope ? { scope: entry.scope } : {}),
      ...(entry.result !== undefined ? { result: entry.result } : {}),
      ...(entry.meta ? { meta: entry.meta } : {}),
      prev,
    };
    const hash = auditHash(base);
    const event: AuditEvent = { ...base, hash };
    if (this.key) {
      event.signature = signHash(hash, this.key);
      event.signer = this.key.did;
    }
    return event;
  }

  async append(entry: AuditEntry): Promise<AuditEvent> {
    const event = this.build(entry);
    this.events.push(event);
    return event;
  }

  async query(q: AuditQuery = {}): Promise<AuditEvent[]> {
    let out = this.events.filter((e) => matches(e, q));
    if (q.limit && q.limit > 0) out = out.slice(-q.limit);
    return out.map((e) => ({ ...e }));
  }

  async verify(): Promise<AuditVerification> {
    return verifyChain(this.events);
  }
}
