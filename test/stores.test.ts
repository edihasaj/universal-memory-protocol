import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryStore,
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

afterEach(() => vi.useRealTimers());

describe("InMemoryStore valid-time defaults", () => {
  const now = "2026-06-04T10:00:00.000Z";

  function record(
    id: string,
    time: Omit<MemoryRecord["time"], "created">,
  ): MemoryRecord {
    return {
      ump: "1.0",
      id,
      kind: "semantic",
      body: { text: `release roadmap ${id}` },
      scope: { owner: OWNER, project: "p", visibility: "private" },
      time: { ...time, created: "2026-06-01T10:00:00Z" },
    };
  }

  async function ids(
    store: InMemoryStore,
    validAt?: string,
  ): Promise<string[]> {
    const results = await store.search({
      query: "release roadmap",
      scope: { owner: OWNER, project: "p" },
      filter: validAt ? { valid_at: validAt } : undefined,
    });
    return results.map(({ record }) => record.id).sort();
  }

  it("uses one inclusive current-validity instant by default", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const store = new InMemoryStore();
    await Promise.all([
      store.put(record("future-open", { valid_from: "2026-06-04T11:00:00Z", valid_to: null })),
      store.put(record("current-open", { valid_from: "2026-06-04T09:00:00Z", valid_to: null })),
      store.put(record("current-bounded", { valid_from: "2026-06-04T09:00:00Z", valid_to: "2026-06-04T11:00:00Z" })),
      store.put(record("expired", { valid_from: "2026-06-04T08:00:00Z", valid_to: "2026-06-04T09:00:00Z" })),
      store.put(record("starts-now", { valid_from: now, valid_to: "2026-06-04T11:00:00Z" })),
      store.put(record("ends-now", { valid_from: "2026-06-04T09:00:00Z", valid_to: now })),
      store.put(record("legacy", { valid_to: null })),
    ]);

    const defaultSearch = await store.search({
      query: "release roadmap",
      scope: { owner: OWNER, project: "p" },
    });
    const explicitSearch = await store.search({
      query: "release roadmap",
      scope: { owner: OWNER, project: "p" },
      filter: { valid_at: now },
    });
    const defaultResults = defaultSearch.map(({ record }) => record.id).sort();
    const explicitResults = explicitSearch.map(({ record }) => record.id).sort();

    expect(defaultResults).toEqual(explicitResults);
    expect(defaultSearch.map(({ signals }) => signals.recency))
      .toEqual(explicitSearch.map(({ signals }) => signals.recency));
    expect(defaultResults).toEqual([
      "current-bounded",
      "current-open",
      "ends-now",
      "legacy",
      "starts-now",
    ]);
  });

  it("keeps explicit historical and future point-in-time lookups", async () => {
    const store = new InMemoryStore();
    await Promise.all([
      store.put(record("historical", {
        valid_from: "2026-06-04T08:00:00Z",
        valid_to: "2026-06-04T09:00:00Z",
      })),
      store.put(record("future", {
        valid_from: "2026-06-04T11:00:00Z",
        valid_to: null,
      })),
    ]);

    await expect(ids(store, "2026-06-04T08:30:00Z")).resolves.toEqual(["historical"]);
    await expect(ids(store, "2026-06-04T11:30:00Z")).resolves.toEqual(["future"]);
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
