/**
 * RecallStore - an UMP `MemoryStore` backed by Recall's engine.
 *
 * Recall keeps its native lifecycle (repo-quality promotion, dedup,
 * consolidation). This store maps reads faithfully; writes flow into Recall's
 * capture pipeline (text → candidate memory) rather than storing the UMP record
 * verbatim - the correct behavior when Recall is the engine. Inject a
 * `RecallBackend` so this file never imports Recall's native (sqlite-vec) deps.
 */

import type { MemoryStore } from "../../src/store.ts";
import type {
  MemoryRecord,
  RecallRequest,
  RecallResult,
} from "../../src/types.ts";
import {
  fromUmpId,
  recallMemoryToRecord,
  recordToRecallCapture,
  type RecallMemory,
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
  /** Recall's capture path (processCorrection). */
  capture(input: {
    text: string;
    type: string;
    repo?: string;
    path?: string;
  }): Promise<{ ids: string[] }>;
}

export class RecallStore implements MemoryStore {
  constructor(
    private backend: RecallBackend,
    private opts: { owner: string },
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

  /** Writes go through Recall's capture pipeline; Recall assigns the id. */
  async put(record: MemoryRecord): Promise<void> {
    await this.backend.capture(recordToRecallCapture(record));
  }

  /** Recall performs its own semantic dedup inside capture. */
  async findDuplicate(): Promise<MemoryRecord | undefined> {
    return undefined;
  }
}
