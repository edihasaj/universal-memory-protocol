/**
 * AmpServer — the six operations (SPEC §3) over a MemoryStore.
 * Binding-neutral: MCP/HTTP/file bindings all call these methods.
 */

import { contentId, randomId } from "./id.ts";
import { sign, verify, type KeyPair } from "./integrity.ts";
import type {
  Capabilities,
  ConformanceLevel,
  FeedbackRequest,
  ForgetRequest,
  MemoryDraft,
  MemoryRecord,
  RecallRequest,
  RecallResponse,
  RememberResponse,
  ReviseRequest,
  ReviseResponse,
} from "./types.ts";
import { AMP_VERSION, AmpError } from "./types.ts";
import type { MemoryStore } from "./store.ts";

export interface AmpServerOptions {
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
}

export class AmpServer {
  private store: MemoryStore;
  private opts: Required<Omit<AmpServerOptions, "key" | "onFeedback" | "store">> &
    Pick<AmpServerOptions, "key" | "onFeedback">;

  constructor(o: AmpServerOptions) {
    this.store = o.store;
    this.opts = {
      name: o.name,
      version: o.version,
      conformance: o.conformance ?? "L3",
      requireSignature: o.requireSignature ?? false,
      now: o.now ?? (() => new Date()),
      key: o.key,
      onFeedback: o.onFeedback,
    };
  }

  capabilities(): Capabilities {
    return {
      server: { name: this.opts.name, version: this.opts.version },
      amp: AMP_VERSION,
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
    };
  }

  async recall(req: RecallRequest): Promise<RecallResponse> {
    if (!req.query?.trim()) throw new AmpError("invalid_record", "empty query");
    const results = await this.store.search(req);
    return { results };
  }

  async get(id: string): Promise<MemoryRecord> {
    const r = await this.store.get(id);
    if (!r) throw new AmpError("not_found", `no record ${id}`);
    return r;
  }

  async remember(draft: MemoryDraft): Promise<RememberResponse> {
    let record = this.materialize(draft);

    // Consent: refuse to store non-exportable public records (policy example).
    if (record.consent?.exportable === false && record.scope.visibility === "public") {
      throw new AmpError("consent_violation", "public record marked non-exportable");
    }

    // L3 signature enforcement on inbound records.
    if (this.opts.requireSignature) {
      if (!record.integrity) throw new AmpError("signature_invalid", "missing signature");
      if (!verify(record)) throw new AmpError("signature_invalid", "bad signature");
    }

    // Dedup → merge.
    const dup = await this.store.findDuplicate(record);
    if (dup) {
      const merged = this.mergeEvidence(dup, record);
      await this.store.put(merged);
      return { id: merged.id, result: "merged" };
    }

    record = this.finalize(record);
    await this.store.put(record);
    return { id: record.id, result: "created" };
  }

  async revise(req: ReviseRequest): Promise<ReviseResponse> {
    const prior = await this.get(req.id);
    const nowIso = this.iso();

    // Successor record.
    const draft: MemoryRecord = {
      ...prior,
      id: "", // reassigned
      body: req.patch.body ?? prior.body,
      lifecycle: { ...prior.lifecycle, ...req.patch.lifecycle },
      relations: req.patch.relations ?? prior.relations,
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
    const successor = this.finalize(draft);
    await this.store.put(successor);

    // Close the prior: set valid_to + superseded_by (non-destructive).
    const closed: MemoryRecord = {
      ...prior,
      time: { ...prior.time, valid_to: prior.time.valid_to ?? nowIso },
      superseded_by: [successor.id, ...(prior.superseded_by ?? [])],
      integrity: undefined,
    };
    await this.store.put(this.finalize(closed));

    return { id: successor.id, supersedes: successor.supersedes ?? [] };
  }

  async forget(req: ForgetRequest): Promise<{ result: "tombstoned" | "erased" }> {
    const prior = await this.get(req.id);
    if (req.hard) {
      // Hard erase: replace body, keep a tombstone shell for audit lineage.
      const shell: MemoryRecord = {
        ...prior,
        body: { text: `[erased: ${req.reason}]` },
        lifecycle: { ...prior.lifecycle, status: "tombstoned" },
        integrity: undefined,
      };
      await this.store.put(this.finalize(shell));
      return { result: "erased" };
    }
    const tombstoned: MemoryRecord = {
      ...prior,
      lifecycle: { ...prior.lifecycle, status: "tombstoned" },
      time: { ...prior.time, valid_to: prior.time.valid_to ?? this.iso() },
      integrity: undefined,
    };
    await this.store.put(this.finalize(tombstoned));
    return { result: "tombstoned" };
  }

  async feedback(req: FeedbackRequest): Promise<{ ok: true }> {
    await this.get(req.id); // 404 if unknown
    await this.opts.onFeedback?.(req);
    return { ok: true };
  }

  // ── internals ───────────────────────────────────────────────────────

  private iso(): string {
    return this.opts.now().toISOString();
  }

  private materialize(draft: MemoryDraft): MemoryRecord {
    const nowIso = this.iso();
    return {
      amp: AMP_VERSION,
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
