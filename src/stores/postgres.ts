import { MirrorStore } from "./mirror.ts";
import type { MemoryRecord } from "../types.ts";

export interface PostgresClient {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface PostgresStoreOptions {
  table?: string;
}

/** PostgreSQL/pg-compatible UMP store. No `pg` dependency; bring your client. */
export class PostgresStore extends MirrorStore {
  private client: PostgresClient;
  private table: string;

  private constructor(client: PostgresClient, table: string) {
    super();
    this.client = client;
    this.table = table;
  }

  static async open(
    client: PostgresClient,
    opts: PostgresStoreOptions = {},
  ): Promise<PostgresStore> {
    const table = safeIdent(opts.table ?? "ump_memories");
    const store = new PostgresStore(client, table);
    await client.query(
      `create table if not exists ${table} (
        id text primary key,
        record jsonb not null,
        kind text generated always as (record->>'kind') stored,
        owner text generated always as (record#>>'{scope,owner}') stored,
        project text generated always as (record#>>'{scope,project}') stored,
        visibility text generated always as (record#>>'{scope,visibility}') stored,
        updated_at timestamptz not null default now()
      )`,
    );
    await client.query(`create index if not exists ${table}_scope_idx on ${table} (owner, project, visibility)`);
    const rows = await client.query<{ record: unknown }>(`select record from ${table}`);
    await store.hydrate(rows.rows.map((r) => parseRecord(r.record)));
    return store;
  }

  protected async persist(record: MemoryRecord): Promise<void> {
    await this.client.query(
      `insert into ${this.table} (id, record, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (id) do update set record = excluded.record, updated_at = now()`,
      [record.id, JSON.stringify(record)],
    );
  }
}

function parseRecord(value: unknown): MemoryRecord {
  return typeof value === "string" ? JSON.parse(value) : value as MemoryRecord;
}

function safeIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`invalid postgres identifier: ${value}`);
  return value;
}
