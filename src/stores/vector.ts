import { MirrorStore } from "./mirror.ts";
import type { MemoryRecord, RecallRequest, RecallResult } from "../types.ts";

export interface VectorMemoryClient {
  upsert(input: { id: string; vector: number[]; record: MemoryRecord }): Promise<void>;
  get(id: string): Promise<MemoryRecord | undefined>;
  list(): Promise<MemoryRecord[]>;
  search(input: {
    vector: number[];
    query: string;
    scope?: RecallRequest["scope"];
    filter?: RecallRequest["filter"];
    limit: number;
  }): Promise<Array<{ record: MemoryRecord; score: number; signals?: Record<string, number> }>>;
}

export interface VectorStoreOptions {
  embed(text: string): Promise<number[]> | number[];
  defaultLimit?: number;
}

/**
 * BYO-vector-database store for Qdrant, Pinecone, Weaviate, pgvector, etc.
 * The vendor client owns vector persistence/search; UMP owns record shape and
 * server semantics.
 */
export class VectorStore extends MirrorStore {
  private client: VectorMemoryClient;
  private opts: VectorStoreOptions;

  constructor(client: VectorMemoryClient, opts: VectorStoreOptions) {
    super();
    this.client = client;
    this.opts = opts;
  }

  static async open(
    client: VectorMemoryClient,
    opts: VectorStoreOptions,
  ): Promise<VectorStore> {
    const store = new VectorStore(client, opts);
    await store.hydrate(await client.list());
    return store;
  }

  override async get(id: string): Promise<MemoryRecord | undefined> {
    return (await super.get(id)) ?? this.client.get(id);
  }

  override async search(req: RecallRequest): Promise<RecallResult[]> {
    const limit = req.limit ?? this.opts.defaultLimit ?? 8;
    const vector = await this.opts.embed(req.query);
    const results = await this.client.search({
      vector,
      query: req.query,
      scope: req.scope,
      filter: req.filter,
      limit,
    });
    return results.map((r) => ({
      record: r.record,
      score: r.score,
      signals: { similarity: r.score, ...(r.signals ?? {}) },
    }));
  }

  protected async persist(record: MemoryRecord): Promise<void> {
    await this.client.upsert({
      id: record.id,
      vector: await this.opts.embed(record.body.text),
      record,
    });
  }
}

export class QdrantStore extends VectorStore {}
export class PineconeStore extends VectorStore {}
export class WeaviateStore extends VectorStore {}
