import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fromJson, toJson } from "../bindings/file.ts";
import { InMemoryStore, type MemoryStore } from "../store.ts";
import type { MemoryRecord, RecallRequest, RecallResult } from "../types.ts";

/**
 * Dependency-free persistent store.
 *
 * Keeps the hot retrieval path in memory, then writes the full portable UMP JSON
 * export atomically after each mutation. This is intended for reference servers,
 * local dogfood, and adapter tests; production engines should supply their own
 * vector/FTS/graph-backed MemoryStore.
 */
export class JsonFileStore implements MemoryStore {
  private inner = new InMemoryStore();
  private writeQueue: Promise<void> = Promise.resolve();
  private filePath: string;

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  static async open(filePath: string): Promise<JsonFileStore> {
    const store = new JsonFileStore(filePath);
    await store.load();
    return store;
  }

  async put(record: MemoryRecord): Promise<void> {
    await this.inner.put(record);
    this.writeQueue = this.writeQueue.then(() => this.flush());
    await this.writeQueue;
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

  private async load(): Promise<void> {
    try {
      const text = await readFile(this.filePath, "utf8");
      for (const record of fromJson(text)) {
        await this.inner.put(record);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      await mkdir(dirname(this.filePath), { recursive: true });
    }
  }

  private async flush(): Promise<void> {
    const records = await this.inner.all();
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, toJson(records), "utf8");
    await rename(tmp, this.filePath);
  }
}
