import { InMemoryStore, type MemoryStore } from "../store.ts";
import type { MemoryRecord, RecallRequest, RecallResult } from "../types.ts";

/**
 * Base store for persistence adapters that mirror records into an in-memory
 * retrieval engine. Persistence owns durability; InMemoryStore owns the small
 * reference ranking path.
 */
export abstract class MirrorStore implements MemoryStore {
  protected inner = new InMemoryStore();

  protected async hydrate(records: Iterable<MemoryRecord>): Promise<void> {
    for (const record of records) await this.inner.put(record);
  }

  async put(record: MemoryRecord): Promise<void> {
    await this.inner.put(record);
    await this.persist(record);
  }

  get(id: string): Promise<MemoryRecord | undefined> {
    return this.inner.get(id);
  }

  all(): Promise<MemoryRecord[]> {
    return this.inner.all();
  }

  search(req: RecallRequest): Promise<RecallResult[]> {
    return this.inner.search(req);
  }

  findDuplicate(record: MemoryRecord): Promise<MemoryRecord | undefined> {
    return this.inner.findDuplicate(record);
  }

  protected abstract persist(record: MemoryRecord): Promise<void>;
}
