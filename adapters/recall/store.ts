/**
 * RecallStore - an UMP `MemoryStore` backed by Recall's engine.
 *
 * Reads map faithfully (Recall's hybrid retrieval). Writes are FAITHFUL by
 * default: `put` stores the UMP record directly as an active Recall memory and
 * returns Recall's id, so `remember` round-trips via `get` and stays fast. Pass
 * `{ smart: true }` to instead route writes through Recall's capture pipeline
 * (extraction + judgement + candidate promotion). Inject a `RecallBackend` so
 * this file never imports Recall's native (sqlite-vec) deps.
 */

import type { MemoryStore, MemoryWriteOptions } from "../../src/store.ts";
import type {
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  RecallRequest,
  RecallResult,
} from "../../src/types.ts";
import { UmpError } from "../../src/types.ts";
import { recordVisibleForScope } from "../../src/policy.ts";
import { rfc3339Timestamp } from "../../src/time.ts";
import {
  fromUmpId,
  toUmpId,
  kindToRecallType,
  recallMemoryToRecord,
  recordToRecallCapture,
  type RecallMemory,
  type RecallType,
  type RecallScope,
} from "./map.ts";

export interface RecallBackend {
  queryMemories(filter: { repo?: string }): RecallMemory[] | Promise<RecallMemory[]>;
  getMemory(id: string): RecallMemory | undefined | Promise<RecallMemory | undefined>;
  /**
   * Hybrid (vector + FTS) retrieval. The backend must honor `limit` without a
   * hidden smaller cap; RecallStore asks for all candidates before applying UMP
   * scope, lifecycle, kind, and validity filters.
   */
  compileHybrid(req: {
    query: string;
    repo?: string;
    path?: string;
    limit?: number;
    filter?: RecallRequest["filter"];
    scope?: Partial<MemoryScope>;
  }): Promise<Array<{ memory: RecallMemory; score: number }>>;
  /**
   * Faithful native persistence. Backends that support this receive the entire
   * UMP record, including temporal fields and structured metadata, and return
   * their canonical native id.
   */
  putRecord?(record: MemoryRecord, existingId?: string): Promise<string>;
  /** Faithful direct write: store the record as a Recall memory; returns its id. */
  storeDirect(input: {
    text: string;
    type: RecallType;
    scope: RecallScope;
    repo?: string;
    confidence: number;
    /** Original UMP kind, preserved in capture-context for round-trip fidelity. */
    kind: MemoryKind;
  }): Promise<string>;
  /** Tombstone an existing memory (forget / supersede); returns true if found. */
  tombstone(id: string): Promise<boolean> | boolean;
  /** Optional: Recall's capture/judgement path (processCorrection). */
  capture?(input: {
    text: string;
    type: string;
    repo?: string;
    path?: string;
    /** Full record for backends that can preserve capture context. */
    ump_record?: MemoryRecord;
  }): Promise<{ ids: string[] }>;
}

export class RecallStore implements MemoryStore {
  constructor(
    private backend: RecallBackend,
    private opts: { owner: string; smart?: boolean; now?: () => Date },
  ) {}

  async get(id: string): Promise<MemoryRecord | undefined> {
    const m = await this.backend.getMemory(fromUmpId(id));
    return m ? recallMemoryToRecord(m, this.opts.owner) : undefined;
  }

  async all(): Promise<MemoryRecord[]> {
    const ms = await this.backend.queryMemories({});
    return ms.map((m) => recallMemoryToRecord(m, this.opts.owner));
  }

  async search(req: RecallRequest): Promise<RecallResult[]> {
    // Resolve "now" once before any backend work so native prefiltering and
    // local filtering agree at a validity boundary.
    const validAt = req.filter?.valid_at ?? (this.opts.now?.() ?? new Date()).toISOString();
    const filter = { ...req.filter, valid_at: validAt };
    // We intentionally request enough ranked rows to remove ineligible hits
    // locally. A short lexical result is a legitimate no-match, never evidence
    // that an engine silently truncated a larger result set.
    const allCandidates = await this.backend.queryMemories({});
    const requestedLimit = req.limit ?? 8;
    const ranked = await this.backend.compileHybrid({
      query: req.query,
      repo: req.scope?.project,
      limit: Math.max(requestedLimit, allCandidates.length),
      filter,
      scope: req.scope,
    });

    const statuses = req.filter?.status ?? ["active", "candidate"];
    const results: RecallResult[] = [];
    for (const { memory, score } of ranked) {
      const record = recallMemoryToRecord(memory, this.opts.owner);
      const status = record.lifecycle?.status ?? "active";
      // Tombstones are not discoverable, including for historical queries.
      if (status === "tombstoned") continue;
      if (!recordVisibleForScope(record, req.scope)) continue;
      if (req.filter?.kind && !req.filter.kind.includes(record.kind)) continue;
      if (!statuses.includes(status)) continue;
      if (!isValidAt(record, validAt)) continue;

      const salience = record.lifecycle?.salience ?? memory.confidence;
      results.push({
        record,
        signals: {
          similarity: score,
          salience,
          confidence: memory.confidence,
          provenance_depth: memory.evidence?.length ?? 0,
        },
        score: 0.7 * score + 0.3 * salience,
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, requestedLimit);
  }

  /**
   * Faithful write by default: store the record and return Recall's id (so the
   * server reports an id that `get` can resolve). `smart` routes through the
   * capture/judgement pipeline instead (Recall decides what is memory-worthy).
   */
  async put(record: MemoryRecord, options?: MemoryWriteOptions): Promise<void | string> {
    const existingId = this.recallIdFor(record.id);
    const existing = existingId
      ? await this.backend.getMemory(existingId)
      : undefined;
    const superseded = (record.superseded_by?.length ?? 0) > 0;

    const tombstone = record.lifecycle?.status === "tombstoned";
    // Forget is a legacy-compatible lifecycle edit. A revision closure is
    // different: without native persistence it must not silently flatten its
    // temporal window or canonical successor relation.
    if (existing && (tombstone || superseded)) {
      if (this.backend.putRecord) {
        return toUmpId(await this.backend.putRecord(record, existingId));
      }
      if (tombstone) {
        await this.backend.tombstone(existingId!);
        return record.id;
      }
      if (needsTemporalPersistence(record, options)) {
        throw new UmpError(
          "unsupported",
          "Recall backend does not preserve observation or validity timestamps",
        );
      }
      await this.backend.tombstone(existingId!);
      return record.id;
    }

    // The legacy row/capture APIs have nowhere to store asserted observation or
    // validity dates. Refuse a temporal write before either direct storage or
    // smart capture can flatten it. An already-stored record may still be
    // tombstoned for backward-compatible forget/revise behavior.
    if (this.opts.smart && this.backend.capture) {
      if (needsTemporalPersistence(record, options)) {
        throw new UmpError(
          "unsupported",
          "Recall backend does not preserve observation or validity timestamps",
        );
      }
      await this.backend.capture(recordToRecallCapture(record));
      return; // capture owns id assignment / judgement; keep the record's id
    }

    // Native backends are the fidelity-preserving default for every write,
    // including lifecycle edits from revise/forget. Smart mode deliberately
    // remains an opt-in capture/judgement route above.
    if (this.backend.putRecord) {
      const nativeId = await this.backend.putRecord(
        record,
        existing ? existingId : undefined,
      );
      return toUmpId(nativeId);
    }

    // Update path: if the record's id already maps to a Recall memory, this is a
    // lifecycle edit (forget tombstone, or the closed prior of a revise) rather
    // than a new write. Tombstone it instead of inserting a duplicate.
    if (needsTemporalPersistence(record, options)) {
      throw new UmpError(
        "unsupported",
        "Recall backend does not preserve observation or validity timestamps",
      );
    }
    if (existing) {
      return record.id; // keep the same id; reads now reflect the new status
    }

    const id = await this.backend.storeDirect({
      text: record.body.text,
      type: kindToRecallType(record.kind),
      scope: record.scope.project ? "repo" : "global",
      repo: record.scope.project,
      confidence: record.lifecycle?.confidence ?? 0.8,
      kind: record.kind,
    });
    return toUmpId(id);
  }

  private recallIdFor(umpId: string): string | undefined {
    if (!/^urn:ump:/.test(umpId)) return undefined;
    try { return fromUmpId(umpId); } catch { return undefined; }
  }

  /** Recall performs its own dedup; let the engine handle it. */
  async findDuplicate(): Promise<MemoryRecord | undefined> {
    return undefined;
  }
}

function isValidAt(record: MemoryRecord, validAt: string): boolean {
  const at = rfc3339Timestamp(validAt);
  const from = record.time.valid_from === undefined
    ? Number.NEGATIVE_INFINITY
    : rfc3339Timestamp(record.time.valid_from);
  const to = record.time.valid_to === undefined || record.time.valid_to === null
    ? Number.POSITIVE_INFINITY
    : rfc3339Timestamp(record.time.valid_to);
  return at !== undefined && from !== undefined && to !== undefined && from <= at && at <= to;
}

function needsTemporalPersistence(
  record: MemoryRecord,
  options: MemoryWriteOptions | undefined,
): boolean {
  // Calls without the internal write context are direct full-record writes
  // (for example revise) and must fail closed on a legacy backend. Ordinary
  // `remember` calls explicitly mark server-generated "now" timestamps false.
  if (options?.explicitTime !== false) return true;
  const created = record.time.created;
  return (
    record.time.observed !== created ||
    record.time.valid_from !== created ||
    (record.time.valid_to !== undefined && record.time.valid_to !== null)
  );
}
