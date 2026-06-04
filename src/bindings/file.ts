/**
 * File binding (SPEC §4.3, §6.3) — the "AGENTS.md of memory".
 * Portable, git-friendly, offline, no server. Two formats:
 *   - *.amp.json : array of records (or NDJSON)
 *   - *.amp.md   : Markdown body + front-matter (round-trips losslessly for L2)
 *
 * Front-matter here uses a compact JSON block (valid YAML subset) so we avoid a
 * YAML dependency while staying human- and Obsidian-readable.
 */

import { AMP_VERSION, type Consent, type MemoryRecord } from "../types.ts";

// ── JSON array binding ──────────────────────────────────────────────────

export function toJson(records: MemoryRecord[]): string {
  return JSON.stringify(records, null, 2) + "\n";
}

export function fromJson(text: string): MemoryRecord[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  return arr.map(assertRecord);
}

export function toNdjson(records: MemoryRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

export function fromNdjson(text: string): MemoryRecord[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => assertRecord(JSON.parse(l)));
}

// ── Markdown projection ─────────────────────────────────────────────────

const FM = "---";

export function toMarkdown(record: MemoryRecord): string {
  const { body, ...meta } = record;
  const fm = JSON.stringify(meta, null, 2);
  return `${FM}\n${fm}\n${FM}\n\n${body.text}\n`;
}

export function fromMarkdown(text: string): MemoryRecord {
  const t = text.replace(/^﻿/, "");
  if (!t.startsWith(FM)) throw new Error("amp.md: missing front-matter");
  const end = t.indexOf(`\n${FM}`, FM.length);
  if (end === -1) throw new Error("amp.md: unterminated front-matter");
  const fm = t.slice(FM.length, end).trim();
  const bodyText = t.slice(end + FM.length + 1).replace(/^\s*\n/, "").trimEnd();
  const meta = JSON.parse(fm);
  return assertRecord({ ...meta, body: { ...(meta.body ?? {}), text: bodyText } });
}

// ── Export with consent enforcement (SPEC §2.7) ─────────────────────────

/** Strip non-exportable records and apply `consent.redact` JSON-paths. */
export function exportRecords(records: MemoryRecord[]): MemoryRecord[] {
  return records
    .filter((r) => r.consent?.exportable !== false)
    .map(redact);
}

function redact(record: MemoryRecord): MemoryRecord {
  const paths = record.consent?.redact;
  if (!paths || paths.length === 0) return record;
  const clone = structuredClone(record) as MemoryRecord & Record<string, unknown>;
  for (const path of paths) deletePath(clone, path.split("."));
  return clone;
}

function deletePath(obj: Record<string, unknown>, segs: string[]): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const next = cur[segs[i]!];
    if (next == null || typeof next !== "object") return;
    cur = next as Record<string, unknown>;
  }
  delete cur[segs[segs.length - 1]!];
}

// ── validation ──────────────────────────────────────────────────────────

function assertRecord(v: unknown): MemoryRecord {
  const r = v as MemoryRecord;
  if (!r || typeof r !== "object") throw new Error("amp: not an object");
  if (r.amp !== AMP_VERSION) throw new Error(`amp: version != ${AMP_VERSION}`);
  if (!r.id || !r.kind || !r.body?.text || !r.scope?.owner) {
    throw new Error("amp: missing required field (id/kind/body.text/scope.owner)");
  }
  return r;
}

export type { Consent };
