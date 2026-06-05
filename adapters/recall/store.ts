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

import type { MemoryStore } from "../../src/store.ts";
import type {
  MemoryRecord,
  RecallRequest,
  RecallResult,
} from "../../src/types.ts";
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
  /** Hybrid (vector + FTS) retrieval; returns ranked memories with a score. */
  compileHybrid(req: {
    query: string;
    repo?: string;
    path?: string;
    limit?: number;
  }): Promise<Array<{ memory: RecallMemory; score: number }>>;
  /** Faithful direct write: store the record as a Recall memory; returns its id. */
  storeDirect(input: {
    text: string;
    type: RecallType;
    scope: RecallScope;
    repo?: string;
    confidence: number;
  }): Promise<string>;
  /** Optional: Recall's capture/judgement path (processCorrection). */
  capture?(input: {
    text: string;
    type: string;
    repo?: string;
    path?: string;
  }): Promise<{ ids: string[] }>;
}

export class RecallStore implements MemoryStore {
  constructor(
    private backend: RecallBackend,
    private opts: { owner: string; smart?: boolean },
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
    const ranked = await this.backend.compileHybrid({
      query: req.query,
      repo: req.scope?.project,
      limit: req.limit ?? 8,
    });
    return ranked.map(({ memory, score }) => {
      const record = recallMemoryToRecord(memory, this.opts.owner);
      const salience = record.lifecycle?.salience ?? memory.confidence;
      return {
        record,
        signals: {
          similarity: score,
          salience,
          confidence: memory.confidence,
          provenance_depth: memory.evidence?.length ?? 0,
        },
        score: 0.7 * score + 0.3 * salience,
      };
    });
  }

  /**
   * Faithful write by default: store the record and return Recall's id (so the
   * server reports an id that `get` can resolve). `smart` routes through the
   * capture/judgement pipeline instead (Recall decides what is memory-worthy).
   */
  async put(record: MemoryRecord): Promise<void | string> {
    if (this.opts.smart && this.backend.capture) {
      await this.backend.capture(recordToRecallCapture(record));
      return; // capture owns id assignment / judgement; keep the record's id
    }
    const id = await this.backend.storeDirect({
      text: record.body.text,
      type: kindToRecallType(record.kind),
      scope: record.scope.project ? "repo" : "global",
      repo: record.scope.project,
      confidence: record.lifecycle?.confidence ?? 0.8,
    });
    return toUmpId(id);
  }

  /** Recall performs its own dedup; let the engine handle it. */
  async findDuplicate(): Promise<MemoryRecord | undefined> {
    return undefined;
  }
}
