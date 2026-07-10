/**
 * File-backed audit log: append-only NDJSON, one JSON event per line.
 *
 * Append is a single line write (O(1), crash-safe append); the full log is
 * loaded into memory on open for `query()`/`verify()`. This is the default for
 * the persistent `ump-memory` server. For large or multi-writer deployments,
 * back `AuditLog` with a database instead - the interface is the same.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  InMemoryAuditLog,
  type AuditEntry,
  type AuditEvent,
  type AuditLogOptions,
} from "./audit.ts";

export class JsonlAuditLog extends InMemoryAuditLog {
  private path: string;

  private constructor(path: string, opts: AuditLogOptions) {
    super(opts);
    this.path = path;
  }

  /** Open (and replay) a log file, creating its directory if needed. */
  static async open(path: string, opts: AuditLogOptions = {}): Promise<JsonlAuditLog> {
    const log = new JsonlAuditLog(path, opts);
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      const text = readFileSync(path, "utf8");
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (t) (log as unknown as { events: AuditEvent[] }).events.push(JSON.parse(t));
      }
    }
    return log;
  }

  override async append(entry: AuditEntry): Promise<AuditEvent> {
    const event = await super.append(entry);
    appendFileSync(this.path, JSON.stringify(event) + "\n");
    return event;
  }
}
