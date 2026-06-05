import { MirrorStore } from "./mirror.ts";
import type { MemoryRecord } from "../types.ts";

export interface RedisClient {
  hSet(key: string, field: string, value: string): Promise<unknown> | unknown;
  hGet?(key: string, field: string): Promise<string | null | undefined> | string | null | undefined;
  hVals(key: string): Promise<string[]> | string[];
}

export interface RedisStoreOptions {
  key?: string;
}

/** Redis hash-backed UMP store. Compatible with node-redis/ioredis-like clients. */
export class RedisStore extends MirrorStore {
  private client: RedisClient;
  private key: string;

  private constructor(client: RedisClient, key: string) {
    super();
    this.client = client;
    this.key = key;
  }

  static async open(
    client: RedisClient,
    opts: RedisStoreOptions = {},
  ): Promise<RedisStore> {
    const store = new RedisStore(client, opts.key ?? "ump:memories");
    const values = await client.hVals(store.key);
    await store.hydrate(values.map((v) => JSON.parse(v) as MemoryRecord));
    return store;
  }

  override async get(id: string): Promise<MemoryRecord | undefined> {
    const local = await super.get(id);
    if (local || !this.client.hGet) return local;
    const value = await this.client.hGet(this.key, id);
    return value ? JSON.parse(value) as MemoryRecord : undefined;
  }

  protected async persist(record: MemoryRecord): Promise<void> {
    await this.client.hSet(this.key, record.id, JSON.stringify(record));
  }
}
