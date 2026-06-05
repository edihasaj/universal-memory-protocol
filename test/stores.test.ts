import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MarkdownDirectoryStore,
  PostgresStore,
  RedisStore,
  SqliteStore,
  UmpServer,
  VectorStore,
  type MemoryRecord,
  type PostgresClient,
  type RedisClient,
  type SqliteDatabase,
  type SqliteStatement,
  type VectorMemoryClient,
} from "../src/index.ts";

const OWNER = "did:key:zStores";

function server(store: any) {
  return new UmpServer({
    name: "store-test",
    version: "0",
    store,
    now: () => new Date("2026-06-04T10:00:00Z"),
  });
}

function draft(text: string) {
  return {
    kind: "semantic" as const,
    body: { text },
    scope: { owner: OWNER, project: "p", visibility: "private" as const },
  };
}

describe("persistent store adapters", () => {
  it("stores one record per human-editable UMP Markdown file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ump-md-"));
    try {
      const first = server(await MarkdownDirectoryStore.open(dir));
      const { id } = await first.remember(draft("markdown store memory"));

      const second = server(await MarkdownDirectoryStore.open(dir));
      expect((await second.get(id)).body.text).toBe("markdown store memory");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists through a pg-compatible client", async () => {
    const client = new FakePostgres();
    const first = server(await PostgresStore.open(client));
    const { id } = await first.remember(draft("postgres memory"));

    const second = server(await PostgresStore.open(client));
    expect((await second.get(id)).body.text).toBe("postgres memory");
  });

  it("persists through a sqlite-compatible database", async () => {
    const db = new FakeSqlite();
    const first = server(await SqliteStore.open(db));
    const { id } = await first.remember(draft("sqlite memory"));

    const second = server(await SqliteStore.open(db));
    expect((await second.get(id)).body.text).toBe("sqlite memory");
  });

  it("persists through a redis hash client", async () => {
    const redis = new FakeRedis();
    const first = server(await RedisStore.open(redis));
    const { id } = await first.remember(draft("redis memory"));

    const second = server(await RedisStore.open(redis));
    expect((await second.get(id)).body.text).toBe("redis memory");
  });

  it("delegates semantic search to a vector database client", async () => {
    const vector = new FakeVector();
    const store = await VectorStore.open(vector, { embed: embedCount });
    const s = server(store);
    const { id } = await s.remember(draft("vector database memory"));

    const res = await s.recall({
      query: "database",
      scope: { owner: OWNER, project: "p" },
    });
    expect(res.results[0]?.record.id).toBe(id);
    expect(vector.lastSearch?.vector).toEqual([8]);
  });
});

class FakePostgres implements PostgresClient {
  records = new Map<string, MemoryRecord>();

  async query(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
    if (/^select record/i.test(sql.trim())) {
      return { rows: [...this.records.values()].map((record) => ({ record })) };
    }
    if (/^insert/i.test(sql.trim())) {
      this.records.set(params[0] as string, JSON.parse(params[1] as string));
    }
    return { rows: [] };
  }
}

class FakeSqlite implements SqliteDatabase {
  records = new Map<string, string>();

  exec(): void {}

  prepare<T = any>(sql: string): SqliteStatement<T> {
    return {
      run: (...params: unknown[]) => {
        this.records.set(params[0] as string, params[1] as string);
      },
      all: () =>
        [...this.records.values()].map((record) => ({ record })) as T[],
    };
  }
}

class FakeRedis implements RedisClient {
  hashes = new Map<string, Map<string, string>>();

  hSet(key: string, field: string, value: string): void {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    hash.set(field, value);
    this.hashes.set(key, hash);
  }

  hGet(key: string, field: string): string | undefined {
    return this.hashes.get(key)?.get(field);
  }

  hVals(key: string): string[] {
    return [...(this.hashes.get(key)?.values() ?? [])];
  }
}

class FakeVector implements VectorMemoryClient {
  records = new Map<string, MemoryRecord>();
  lastSearch?: { vector: number[] };

  async upsert(input: { id: string; vector: number[]; record: MemoryRecord }): Promise<void> {
    this.records.set(input.id, input.record);
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    return this.records.get(id);
  }

  async list(): Promise<MemoryRecord[]> {
    return [...this.records.values()];
  }

  async search(input: { vector: number[]; limit: number }): Promise<Array<{ record: MemoryRecord; score: number }>> {
    this.lastSearch = { vector: input.vector };
    return [...this.records.values()].slice(0, input.limit).map((record) => ({
      record,
      score: 0.92,
    }));
  }
}

function embedCount(text: string): number[] {
  return [text.length];
}
