/**
 * Store interface + an in-memory reference implementation.
 *
 * The interface is what UMP standardizes; the *engine* (ranking algorithm,
 * dedup policy, decay) is where implementations compete (SPEC §2.4, §3.2).
 * InMemoryStore is a tiny, dependency-free reference: lexical-overlap scoring,
 * exact-text dedup. Production stores (Recall) swap in vector/graph hybrids.
 */

import type {
  MemoryRecord,
  RecallRequest,
  RecallResult,
} from "./types.ts";
import { recordVisibleForScope } from "./policy.ts";
import { rfc3339Timestamp } from "./time.ts";

/**
 * Internal write provenance. This is not part of the portable UMP wire record:
 * it lets adapters distinguish server-materialized timestamps from timestamps
 * explicitly supplied by a caller that must not be flattened.
 */
export interface MemoryWriteOptions {
  explicitTime?: boolean;
}

export interface MemoryStore {
  /**
   * Persist a record. May return the store's canonical id for the record (used
   * by engines like Recall that assign their own ids); when it returns void the
   * server keeps the record's existing id.
   */
  put(record: MemoryRecord, options?: MemoryWriteOptions): Promise<void | string>;
  get(id: string): Promise<MemoryRecord | undefined>;
  /** All records (engines override search; default loops this). */
  all(): Promise<MemoryRecord[]>;
  search(req: RecallRequest): Promise<RecallResult[]>;
  /** Find an existing record with identical body+scope (dedup). */
  findDuplicate(
    record: MemoryRecord,
    options?: MemoryWriteOptions,
  ): Promise<MemoryRecord | undefined>;
}

export class InMemoryStore implements MemoryStore {
  private records = new Map<string, MemoryRecord>();

  async put(record: MemoryRecord, _options?: MemoryWriteOptions): Promise<void> {
    this.records.set(record.id, record);
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    return this.records.get(id);
  }

  async all(): Promise<MemoryRecord[]> {
    return [...this.records.values()];
  }

  async findDuplicate(
    record: MemoryRecord,
    options?: MemoryWriteOptions,
  ): Promise<MemoryRecord | undefined> {
    // Explicit temporal assertions are evidence with their own history. Keep
    // each rather than merging an interval or observation window away.
    if (options?.explicitTime !== false) return undefined;
    const key = dedupeKey(record);
    for (const r of this.records.values()) {
      if (
        dedupeKey(r) === key &&
        r.lifecycle?.status !== "tombstoned" &&
        isDefaultOpenRecordAt(r, record.time.valid_from ?? record.time.created)
      ) {
        return r;
      }
    }
    return undefined;
  }

  async search(req: RecallRequest): Promise<RecallResult[]> {
    // Capture one effective instant so validity and recency agree throughout
    // this search. An omitted valid_at means "now" (SPEC §3.2).
    const validAt = req.filter?.valid_at ?? new Date().toISOString();
    const limit = req.limit ?? 8;
    const wantKinds = req.filter?.kind;
    const wantStatus = req.filter?.status ?? ["active", "candidate"];
    const qTokens = tokenize(req.query);

    const scored: RecallResult[] = [];
    for (const record of this.records.values()) {
      if (!recordVisibleForScope(record, req.scope)) continue;
      const status = record.lifecycle?.status ?? "active";
      if (!wantStatus.includes(status)) continue;
      if (wantKinds && !wantKinds.includes(record.kind)) continue;
      if (!validAtMatches(record, validAt)) continue;

      const similarity = jaccard(qTokens, tokenize(record.body.text));
      const scope_match = scopeMatch(record, req);
      const recency = recencyScore(record, validAt);
      const salience = record.lifecycle?.salience ?? 0.5;
      const provenance_depth = record.provenance?.evidence?.length ?? 0;

      // Blended default ranking. Engines may weight differently.
      const score =
        0.5 * similarity +
        0.2 * scope_match +
        0.15 * recency +
        0.15 * salience;

      if (similarity === 0 && scope_match === 0) continue;

      scored.push({
        record,
        signals: { similarity, scope_match, recency, salience, provenance_depth },
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    if (req.ranking_hints?.prefer?.includes("recency")) {
      scored.sort(
        (a, b) => (b.signals.recency ?? 0) - (a.signals.recency ?? 0),
      );
    }
    return scored.slice(0, limit);
  }
}

// ── scoring helpers ─────────────────────────────────────────────────────

function dedupeKey(r: MemoryRecord): string {
  return [
    r.kind,
    r.scope.owner,
    r.scope.project ?? "",
    r.body.text.trim().toLowerCase(),
  ].join("\u001f");
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function scopeMatch(r: MemoryRecord, req: RecallRequest): number {
  const s = req.scope;
  if (!s) return 0.5;
  let hits = 0;
  let total = 0;
  if (s.owner) { total++; if (s.owner === r.scope.owner) hits++; }
  if (s.project) { total++; if (s.project === r.scope.project) hits++; }
  if (s.agent) { total++; if (s.agent === r.scope.agent) hits++; }
  return total === 0 ? 0.5 : hits / total;
}

function validAtMatches(r: MemoryRecord, at: string): boolean {
  const t = Date.parse(at);
  const from = r.time.valid_from ? Date.parse(r.time.valid_from) : -Infinity;
  const to = r.time.valid_to ? Date.parse(r.time.valid_to) : Infinity;
  return from <= t && t <= to;
}

/**
 * An undated write can merge only into an open default-shaped record that was
 * current at the incoming write's server-generated validity instant. This
 * avoids flattening a future, expired, or bounded historical assertion.
 */
function isDefaultOpenRecordAt(record: MemoryRecord, at: string): boolean {
  const from = record.time.valid_from ?? record.time.created;
  const observed = record.time.observed ?? record.time.created;
  const fromTimestamp = rfc3339Timestamp(from);
  const atTimestamp = rfc3339Timestamp(at);
  return (
    (record.time.valid_to === undefined || record.time.valid_to === null) &&
    observed === record.time.created &&
    from === record.time.created &&
    fromTimestamp !== undefined &&
    atTimestamp !== undefined &&
    fromTimestamp <= atTimestamp
  );
}


function recencyScore(r: MemoryRecord, at: string): number {
  const now = Date.parse(at);
  const obs = Date.parse(r.time.observed ?? r.time.created);
  if (Number.isNaN(obs)) return 0;
  const ageDays = Math.max(0, (now - obs) / 86_400_000);
  // half-life ~90 days
  return Math.pow(0.5, ageDays / 90);
}
