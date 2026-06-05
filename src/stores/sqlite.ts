import { MirrorStore } from "./mirror.ts";
import type { MemoryRecord } from "../types.ts";

export interface SqliteStatement<T = any> {
  run(...params: unknown[]): unknown;
  get?(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
}

export interface SqliteDatabase {
  exec(sql: string): unknown;
  prepare<T = any>(sql: string): SqliteStatement<T>;
}

export interface SqliteStoreOptions {
  table?: string;
}

/** better-sqlite3 / node:sqlite compatible store. No SQLite dependency bundled. */
export class SqliteStore extends MirrorStore {
  private db: SqliteDatabase;
  private table: string;

  private constructor(db: SqliteDatabase, table: string) {
    super();
    this.db = db;
    this.table = table;
  }

  static async open(
    db: SqliteDatabase,
    opts: SqliteStoreOptions = {},
  ): Promise<SqliteStore> {
    const table = safeIdent(opts.table ?? "ump_memories");
    const store = new SqliteStore(db, table);
    db.exec(`
      create table if not exists ${table} (
        id text primary key,
        record text not null,
        kind text generated always as (json_extract(record, '$.kind')) virtual,
        owner text generated always as (json_extract(record, '$.scope.owner')) virtual,
        project text generated always as (json_extract(record, '$.scope.project')) virtual,
        visibility text generated always as (json_extract(record, '$.scope.visibility')) virtual,
        updated_at text not null default (datetime('now'))
      );
      create index if not exists ${table}_scope_idx on ${table} (owner, project, visibility);
    `);
    const rows = db.prepare<{ record: string }>(`select record from ${table}`).all();
    await store.hydrate(rows.map((r) => JSON.parse(r.record) as MemoryRecord));
    return store;
  }

  protected async persist(record: MemoryRecord): Promise<void> {
    this.db
      .prepare(
        `insert into ${this.table} (id, record, updated_at)
         values (?, ?, datetime('now'))
         on conflict(id) do update set record = excluded.record, updated_at = datetime('now')`,
      )
      .run(record.id, JSON.stringify(record));
  }
}

function safeIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`invalid sqlite identifier: ${value}`);
  return value;
}
