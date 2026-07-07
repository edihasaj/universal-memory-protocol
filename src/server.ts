/**
 * UmpServer - the six operations (SPEC §3) over a MemoryStore.
 * Binding-neutral: MCP/HTTP/file bindings all call these methods.
 */

import { contentId, randomId } from "./id.ts";
import { sign, verify, type KeyPair } from "./integrity.ts";
import type {
  AuditActor,
  Capabilities,
  ConformanceLevel,
  FeedbackRequest,
  ForgetRequest,
  MemoryDraft,
  MemoryRecord,
  Provenance,
  RecallRequest,
  RecallResponse,
  RememberResponse,
  ReviseRequest,
  ReviseResponse,
} from "./types.ts";
import { UMP_VERSION, UmpError } from "./types.ts";
import type { MemoryStore } from "./store.ts";
import type {
  AuditEntry,
  AuditEvent,
  AuditLog,
  AuditQuery,
  AuditVerification,
} from "./audit.ts";
import { validateDraft } from "./validate.ts";
import {
  recordForScope,
  recordVisibleForScope,
  retentionExpired,
} from "./policy.ts";

/** A record-change event emitted to `subscribe` listeners (SPEC §3.8). */
export interface ChangeEvent {
  type: "created" | "merged" | "revised" | "tombstoned";
  id: string;
  record: MemoryRecord;
}
export type ChangeListener = (e: ChangeEvent) => void;

export interface UmpServerOptions {
  name: string;
  version: string;
  conformance?: ConformanceLevel;
  store: MemoryStore;
  /** Signing key for L3 (sign on write, identify the operator). */
  key?: KeyPair;
  /** Require valid signatures on incoming records (L3). */
  requireSignature?: boolean;
  /** Clock injection for testability. */
  now?: () => Date;
  /** Feedback sink (e.g. learning engine). */
  onFeedback?: (req: FeedbackRequest) => void | Promise<void>;
  /**
   * Optional append-only audit log (SPEC §9). When set, every operation - reads
   * included - is recorded as a hash-chained event queryable via `audit()`.
   */
  audit?: AuditLog;
}

export class UmpServer {
  private store: MemoryStore;
  private listeners = new Set<{ scope?: Partial<MemoryRecord["scope"]>; fn: ChangeListener }>();
  private opts: Required<
    Omit<UmpServerOptions, "key" | "onFeedback" | "store" | "audit">
  > &
    Pick<UmpServerOptions, "key" | "onFeedback" | "audit">;

  constructor(o: UmpServerOptions) {
    this.store = o.store;
    this.opts = {
      name: o.name,
      version: o.version,
      conformance: o.conformance ?? "L1",
      requireSignature: o.requireSignature ?? false,
      now: o.now ?? (() => new Date()),
      key: o.key,
      onFeedback: o.onFeedback,
      audit: o.audit,
    };
  }

  capabilities(): Capabilities {
    return {
      server: { name: this.opts.name, version: this.opts.version },
      ump: UMP_VERSION,
      conformance: this.opts.conformance,
      kinds: ["semantic", "episodic", "procedural", "working", "identity"],
      bindings: ["mcp", "http", "file"],
      retrieval_signals: [
        "similarity",
        "scope_match",
        "recency",
        "salience",
        "provenance_depth",
      ],
      max_recall: 50,
      writable: true,
      audit: !!this.opts.audit,
    };
  }

  /** Query the audit trail (SPEC §9). Throws `unsupported` if auditing is off. */
  async audit(query: AuditQuery = {}): Promise<AuditEvent[]> {
    if (!this.opts.audit) throw new UmpError("unsupported", "audit trail not enabled");
    return this.opts.audit.query(query);
  }

  /** Verify the audit trail's hash chain (and signatures) end to end. */
  async verifyAudit(): Promise<AuditVerification> {
    if (!this.opts.audit) throw new UmpError("unsupported", "audit trail not enabled");
    return this.opts.audit.verify();
  }

  async recall(req: RecallRequest): Promise<RecallResponse> {
    if (!req.query?.trim()) throw new UmpError("invalid_record", "empty query");
    const results = await this.store.search(req);
    const filtered = [];
    for (const result of results) {
      if (!recordVisibleForScope(result.record, req.scope)) continue;
      const record = await this.applyRetention(result.record);
      if (record.lifecycle?.status === "tombstoned") continue;
      filtered.push({ ...result, record: recordForScope(record, req.scope) });
    }
    await this.record({
      op: "recall",
      actor: req.actor,
      scope: req.scope,
      targets: filtered.map((r) => r.record.id),
      result: `${filtered.length} hits`,
      meta: { query: req.query, count: filtered.length },
    });
    return { results: filtered };
  }

  /**
   * Load a record with retention applied, WITHOUT writing an audit event.
   * For authorization pre-checks and internal loads (bindings, revise/forget).
   */
  async peek(id: string, scope?: Partial<MemoryRecord["scope"]>): Promise<MemoryRecord> {
    const r = await this.store.get(id);
    if (!r) throw new UmpError("not_found", `no record ${id}`);
    const record = await this.applyRetention(r);
    return scope ? recordForScope(record, scope) : record;
  }

  async get(
    id: string,
    scope?: Partial<MemoryRecord["scope"]>,
    actor?: AuditActor,
  ): Promise<MemoryRecord> {
    const record = await this.peek(id, scope);
    await this.record({
      op: "get",
      actor,
      scope: record.scope,
      targets: [id],
      result: "ok",
    });
    return record;
  }

  async remember(draft: MemoryDraft): Promise<RememberResponse> {
    // Structural validation against UMP 0.1 (SPEC §2).
    const problems = validateDraft(draft);
    if (problems.length) throw new UmpError("invalid_record", problems.join("; "));

    let record = this.materialize(draft);

    // Consent: refuse to store non-exportable public records (policy example).
    if (record.consent?.exportable === false && record.scope.visibility === "public") {
      throw new UmpError("consent_violation", "public record marked non-exportable");
    }

    // L3 signature enforcement on inbound records.
    if (this.opts.requireSignature) {
      if (!record.integrity) throw new UmpError("signature_invalid", "missing signature");
      if (!verify(record)) throw new UmpError("signature_invalid", "bad signature");
    }

    // Dedup → merge.
    const dup = await this.store.findDuplicate(record);
    if (dup) {
      const merged = this.mergeEvidence(dup, record);
      const mergedId = (await this.store.put(merged)) || merged.id;
      this.emit({ type: "merged", id: mergedId, record: merged });
      await this.record({
        op: "remember",
        actor: actorOf(record.provenance),
        scope: record.scope,
        targets: [mergedId],
        result: "merged",
      });
      return { id: mergedId, result: "merged" };
    }

    record = this.finalize(record);
    const id = (await this.store.put(record)) || record.id;
    this.emit({ type: "created", id, record });
    await this.record({
      op: "remember",
      actor: actorOf(record.provenance),
      scope: record.scope,
      targets: [id],
      result: "created",
    });
    return { id, result: "created" };
  }

  async revise(req: ReviseRequest): Promise<ReviseResponse> {
    const prior = await this.peek(req.id);
    const nowIso = this.iso();

    // Successor record.
    const draft: MemoryRecord = {
      ...prior,
      id: "", // reassigned
      body: req.patch.body ?? prior.body,
      lifecycle: { ...prior.lifecycle, ...req.patch.lifecycle },
      relations: req.patch.relations ?? prior.relations,
      // Attribute the revision to whoever performed it (audit trail), keeping
      // the prior's provenance if no actor is supplied.
      provenance: stampProvenance(prior, req.actor, "revise"),
      time: {
        created: nowIso,
        observed: nowIso,
        valid_from: req.patch.time?.valid_from ?? nowIso,
        valid_to: req.patch.time?.valid_to ?? null,
      },
      supersedes: [prior.id, ...(prior.supersedes ?? [])],
      superseded_by: [],
      integrity: undefined,
    };

    // Validate the successor so a malformed patch (e.g. a list `body`) can't
    // silently change the record shape returned by a subsequent `get`.
    const problems = validateDraft({ ...draft, id: undefined });
    if (problems.length) throw new UmpError("invalid_record", problems.join("; "));

    const successor = this.finalize(draft);
    const successorId = (await this.store.put(successor)) || successor.id;

    // Close the prior: set valid_to + superseded_by (non-destructive).
    const closed: MemoryRecord = {
      ...prior,
      time: { ...prior.time, valid_to: prior.time.valid_to ?? nowIso },
      superseded_by: [successor.id, ...(prior.superseded_by ?? [])],
      integrity: undefined,
    };
    await this.store.put(this.finalize(closed));

    this.emit({ type: "revised", id: successorId, record: successor });
    await this.record({
      op: "revise",
      actor: req.actor,
      scope: successor.scope,
      targets: [successorId, prior.id],
      result: "revised",
      meta: { supersedes: successor.supersedes },
    });
    return { id: successorId, supersedes: successor.supersedes ?? [] };
  }

  async forget(req: ForgetRequest): Promise<{ result: "tombstoned" | "erased" }> {
    const prior = await this.peek(req.id);
    const provenance = stampProvenance(prior, req.actor, "forget");
    if (req.hard) {
      // Hard erase: replace body, keep a tombstone shell for audit lineage.
      const shell: MemoryRecord = {
        ...prior,
        body: { text: `[erased: ${req.reason}]` },
        lifecycle: { ...prior.lifecycle, status: "tombstoned" },
        provenance,
        integrity: undefined,
      };
      const e = this.finalize(shell);
      await this.store.put(e);
      this.emit({ type: "tombstoned", id: e.id, record: e });
      await this.record({
        op: "forget",
        actor: req.actor,
        scope: e.scope,
        targets: [e.id],
        result: "erased",
        meta: { reason: req.reason, hard: true },
      });
      return { result: "erased" };
    }
    const tombstoned: MemoryRecord = {
      ...prior,
      lifecycle: { ...prior.lifecycle, status: "tombstoned" },
      provenance,
      time: { ...prior.time, valid_to: prior.time.valid_to ?? this.iso() },
      integrity: undefined,
    };
    const t = this.finalize(tombstoned);
    await this.store.put(t);
    this.emit({ type: "tombstoned", id: t.id, record: t });
    await this.record({
      op: "forget",
      actor: req.actor,
      scope: t.scope,
      targets: [t.id],
      result: "tombstoned",
      meta: { reason: req.reason, hard: false },
    });
    return { result: "tombstoned" };
  }

  async feedback(req: FeedbackRequest): Promise<{ ok: true }> {
    const record = await this.peek(req.id); // 404 if unknown
    await this.opts.onFeedback?.(req);
    await this.record({
      op: "feedback",
      actor: req.actor,
      scope: record.scope,
      targets: [req.id],
      result: req.outcome,
      meta: { outcome: req.outcome, session: req.session },
    });
    return { ok: true };
  }

  /**
   * Subscribe to record changes in an optional scope (SPEC §3.8). Returns an
   * unsubscribe function. Bindings adapt this to MCP notifications / SSE.
   */
  subscribe(
    fn: ChangeListener,
    scope?: Partial<MemoryRecord["scope"]>,
  ): () => void {
    const entry = { scope, fn };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  // ── internals ───────────────────────────────────────────────────────

  private emit(e: ChangeEvent): void {
    for (const l of this.listeners) {
      if (scopeMatches(l.scope, e.record.scope)) {
        try { l.fn(e); } catch { /* listener errors never break a write */ }
      }
    }
  }

  /** Append an audit event when an audit log is configured (else a no-op). */
  private async record(entry: AuditEntry): Promise<void> {
    if (this.opts.audit) await this.opts.audit.append(entry);
  }

  private iso(): string {
    return this.opts.now().toISOString();
  }

  private materialize(draft: MemoryDraft): MemoryRecord {
    const nowIso = this.iso();
    return {
      ump: UMP_VERSION,
      id: draft.id ?? "",
      kind: draft.kind,
      body: draft.body,
      scope: draft.scope,
      time: {
        created: draft.time?.created ?? nowIso,
        observed: draft.time?.observed ?? nowIso,
        valid_from: draft.time?.valid_from ?? nowIso,
        valid_to: draft.time?.valid_to ?? null,
      },
      lifecycle: { status: "active", confidence: 0.6, ...draft.lifecycle },
      supersedes: draft.supersedes,
      superseded_by: draft.superseded_by ?? [],
      relations: draft.relations,
      provenance: draft.provenance,
      consent: draft.consent,
      integrity: draft.integrity,
    };
  }

  private async applyRetention(record: MemoryRecord): Promise<MemoryRecord> {
    if (
      record.lifecycle?.status === "tombstoned" ||
      !retentionExpired(record, this.opts.now())
    ) {
      return record;
    }
    const tombstoned: MemoryRecord = {
      ...record,
      lifecycle: { ...record.lifecycle, status: "tombstoned" },
      time: { ...record.time, valid_to: record.time.valid_to ?? this.iso() },
      integrity: undefined,
    };
    const finalized = this.finalize(tombstoned);
    await this.store.put(finalized);
    this.emit({ type: "tombstoned", id: finalized.id, record: finalized });
    return finalized;
  }

  /** Assign id (content-addressed if signing) and sign if a key is present. */
  private finalize(record: MemoryRecord): MemoryRecord {
    let r = record;
    if (this.opts.key) {
      if (!r.id) r = { ...r, id: contentId(r) };
      return sign(r, this.opts.key);
    }
    if (!r.id) r = { ...r, id: randomId() };
    return r;
  }

  private mergeEvidence(existing: MemoryRecord, incoming: MemoryRecord): MemoryRecord {
    const evidence = [
      ...(existing.provenance?.evidence ?? []),
      ...(incoming.provenance?.evidence ?? []),
    ];
    const confidence = Math.min(
      1,
      (existing.lifecycle?.confidence ?? 0.6) + 0.1,
    );
    const merged: MemoryRecord = {
      ...existing,
      lifecycle: { ...existing.lifecycle, confidence },
      provenance: existing.provenance
        ? { ...existing.provenance, evidence }
        : incoming.provenance,
      time: { ...existing.time, observed: this.iso() },
      integrity: undefined,
    };
    return this.finalize(merged);
  }
}

/** Extract an audit actor from a record's provenance, if any. */
function actorOf(provenance?: Provenance): AuditActor | undefined {
  if (!provenance?.actor) return undefined;
  return { did: provenance.actor, kind: provenance.actor_kind };
}

/**
 * Build provenance attributing a `revise`/`forget` to the acting principal.
 * With no actor supplied, the prior record's provenance is preserved (so
 * behavior is unchanged for callers that don't pass one).
 */
function stampProvenance(
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

/** Does a subscription filter (subset) match a record's scope? */
function scopeMatches(
  filter: Partial<MemoryRecord["scope"]> | undefined,
  scope: MemoryRecord["scope"],
): boolean {
  if (!filter) return true;
  return (Object.keys(filter) as (keyof MemoryRecord["scope"])[]).every(
    (k) => filter[k] === undefined || filter[k] === scope[k],
  );
}
