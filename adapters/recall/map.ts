/**
 * Recall ↔ UMP mapping (pure functions).
 *
 * Recall is the reference *engine* (hybrid retrieval, repo-quality promotion,
 * consolidation); UMP is the portable *protocol*. These functions translate
 * Recall's native memory rows into UMP records and back, so a `recall ump`
 * command can serve UMP over Recall's existing store. See ./README.md.
 */

import { base32nopad } from "@scure/base";
import {
  UMP_VERSION,
  type ActorKind,
  type MemoryDraft,
  type MemoryKind,
  type MemoryRecord,
} from "../../src/types.ts";

// Recall's native shapes, modeled locally so this adapter does not import
// Recall internals (which pull native sqlite-vec deps). The real backend
// supplies objects matching these fields.
export type RecallType = "rule" | "command" | "gotcha" | "decision" | "review_pattern";
export type RecallScope = "session" | "path" | "repo" | "team" | "global";
export type RecallStatus = "transient" | "candidate" | "active" | "rejected";

export interface RecallMemory {
  id: string;
  text: string;
  type: RecallType;
  scope: RecallScope;
  status: RecallStatus;
  confidence: number;
  repo?: string | null;
  path?: string | null;
  source?: string;
  supersedes?: string | null;
  created_at?: string;
  updated_at?: string;
  last_validated_at?: string | null;
  evidence?: Array<{ ref?: string; context?: string }>;
  /**
   * Recall capture context. Faithful writes retain the complete original UMP
   * record here because Recall's native row shape has no fields for validity,
   * structured bodies, relations, or protocol provenance.
   */
  capture_context?: {
    ump_kind?: string;
    ump_record?: MemoryRecord;
  } | null;
}

const TYPE_TO_KIND: Record<RecallType, MemoryKind> = {
  rule: "procedural",
  command: "procedural",
  gotcha: "episodic",
  decision: "semantic",
  review_pattern: "procedural",
};

// UMP kind → best-fit Recall type for the capture path.
const KIND_TO_TYPE: Record<MemoryKind, RecallType> = {
  procedural: "rule",
  semantic: "decision",
  episodic: "gotcha",
  working: "rule",
  identity: "decision",
};

export function recallTypeToKind(t: RecallType): MemoryKind {
  return TYPE_TO_KIND[t] ?? "semantic";
}

export function kindToRecallType(k: MemoryKind): RecallType {
  return KIND_TO_TYPE[k] ?? "decision";
}

/** Map a Recall memory row → an UMP Memory Record. */
export function recallMemoryToRecord(m: RecallMemory, owner: string): MemoryRecord {
  const preserved = m.capture_context?.ump_record;
  if (preserved) return canonicalRecord(preserved, m);

  const status =
    m.status === "active" ? "active" : m.status === "rejected" ? "tombstoned" : "candidate";
  const created = m.created_at ?? new Date(0).toISOString();
  return {
    ump: UMP_VERSION,
    id: toUmpId(m.id),
    // Prefer the original UMP kind (preserved in capture-context); fall back to
    // mapping Recall's native type when it was not written through UMP.
    kind: isMemoryKind(m.capture_context?.ump_kind)
      ? m.capture_context.ump_kind
      : recallTypeToKind(m.type),
    body: { text: m.text },
    scope: {
      owner,
      project: m.repo ?? undefined,
      // Recall's global scope → shared visibility; everything else private.
      visibility: m.scope === "global" ? "shared" : "private",
    },
    time: {
      created,
      observed: created,
      valid_from: created,
      valid_to: m.status === "rejected" ? (m.updated_at ?? created) : null,
    },
    lifecycle: {
      confidence: m.confidence,
      salience: clamp01(m.confidence),
      status: status === "candidate" ? "candidate" : status,
    },
    supersedes: m.supersedes ? [toUmpId(m.supersedes)] : undefined,
    provenance: {
      actor: owner,
      actor_kind: recallSourceToActor(m.source),
      method: m.source ?? "recall",
      evidence: (m.evidence ?? []).map((e) => ({ ref: e.ref ?? e.context ?? "recall" })),
    },
  };
}

/** Map an UMP draft (from `remember`) → Recall capture input. */
export function recordToRecallCapture(d: MemoryDraft): {
  text: string;
  type: RecallType;
  repo?: string;
  path?: string;
  ump_record?: MemoryRecord;
} {
  return {
    text: d.body.text,
    type: kindToRecallType(d.kind),
    repo: d.scope?.project,
    path: undefined,
    ump_record: isMemoryRecord(d) ? d : undefined,
  };
}

/**
 * Restore the complete UMP record saved by a faithful backend, while treating
 * Recall's canonical id, text, and rejection state as authoritative.
 */
function canonicalRecord(saved: MemoryRecord, native: RecallMemory): MemoryRecord {
  const id = toUmpId(native.id);
  const text = native.text;
  const rejected = native.status === "rejected";
  const changed = saved.id !== id || saved.body.text !== text ||
    (rejected && saved.lifecycle?.status !== "tombstoned");
  const lifecycle = {
    ...saved.lifecycle,
    status: rejected
      ? "tombstoned" as const
      : saved.lifecycle?.status ?? "active" as const,
  };
  return {
    ...structuredClone(saved),
    id,
    body: { ...saved.body, text },
    lifecycle,
    // An integrity signature covers the record id and body. Native ids are
    // usually assigned after the UMP write, so never return a stale signature.
    integrity: changed ? undefined : saved.integrity,
  };
}

// ── id bridging ─────────────────────────────────────────────────────────
// Recall ids are uuids; UMP ids are `urn:ump:<base32>`. We namespace Recall
// ids so they round-trip without collision.

export function toUmpId(recallId: string): string {
  if (/^urn:ump:/.test(recallId)) return recallId;
  return "urn:ump:" + base32(recallId);
}

export function fromUmpId(umpId: string): string {
  const m = /^urn:ump:(.+)$/.exec(umpId);
  return m ? unbase32(m[1]!) : umpId;
}

/** @deprecated use toUmpId */
export const toAmpId = toUmpId;
/** @deprecated use fromUmpId */
export const fromAmpId = fromUmpId;

function recallSourceToActor(source?: string): ActorKind {
  if (!source) return "agent";
  if (source.includes("scan")) return "scan";
  if (source.includes("correction") || source.includes("user")) return "user";
  if (source.includes("review")) return "agent";
  return "agent";
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function isMemoryKind(value: unknown): value is MemoryKind {
  return ["semantic", "episodic", "procedural", "working", "identity"].includes(
    value as MemoryKind,
  );
}

function isMemoryRecord(value: MemoryDraft): value is MemoryRecord {
  return (
    value.ump === UMP_VERSION &&
    typeof value.id === "string" &&
    value.time?.created !== undefined &&
    value.time?.valid_from !== undefined
  );
}

// lowercase base32 (a-z2-7) of a utf-8 string - matches urn:ump:<base32>,
// stable and reversible so Recall uuids round-trip through UMP ids.
function base32(s: string): string {
  return base32nopad.encode(new TextEncoder().encode(s)).toLowerCase();
}
function unbase32(s: string): string {
  return new TextDecoder().decode(base32nopad.decode(s.toUpperCase()));
}
