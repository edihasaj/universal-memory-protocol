/**
 * Recall ↔ AMP mapping (pure functions).
 *
 * Recall is the reference *engine* (hybrid retrieval, repo-quality promotion,
 * consolidation); AMP is the portable *protocol*. These functions translate
 * Recall's native memory rows into AMP records and back, so a `recall amp`
 * command can serve AMP over Recall's existing store. See ./README.md.
 */

import { base32nopad } from "@scure/base";
import type {
  ActorKind,
  MemoryDraft,
  MemoryKind,
  MemoryRecord,
  MemoryStatus,
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
}

const TYPE_TO_KIND: Record<RecallType, MemoryKind> = {
  rule: "procedural",
  command: "procedural",
  gotcha: "episodic",
  decision: "semantic",
  review_pattern: "procedural",
};

// AMP kind → best-fit Recall type for the capture path.
const KIND_TO_TYPE: Record<MemoryKind, RecallType> = {
  procedural: "rule",
  semantic: "decision",
  episodic: "gotcha",
  working: "rule",
  identity: "decision",
};

const STATUS_TO_AMP: Record<RecallStatus, MemoryStatus | "rejected"> = {
  transient: "candidate",
  candidate: "candidate",
  active: "active",
  rejected: "tombstoned",
};

export function recallTypeToKind(t: RecallType): MemoryKind {
  return TYPE_TO_KIND[t] ?? "semantic";
}

export function kindToRecallType(k: MemoryKind): RecallType {
  return KIND_TO_TYPE[k] ?? "decision";
}

/** Map a Recall memory row → an AMP Memory Record. */
export function recallMemoryToRecord(m: RecallMemory, owner: string): MemoryRecord {
  const status: MemoryStatus =
    m.status === "active" ? "active" : m.status === "rejected" ? "tombstoned" : "candidate";
  const created = m.created_at ?? new Date(0).toISOString();
  return {
    amp: "0.1",
    id: toAmpId(m.id),
    kind: recallTypeToKind(m.type),
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
    supersedes: m.supersedes ? [toAmpId(m.supersedes)] : undefined,
    provenance: {
      actor: owner,
      actor_kind: recallSourceToActor(m.source),
      method: m.source ?? "recall",
      evidence: (m.evidence ?? []).map((e) => ({ ref: e.ref ?? e.context ?? "recall" })),
    },
  };
}

/** Map an AMP draft (from `remember`) → Recall capture input. */
export function recordToRecallCapture(d: MemoryDraft): {
  text: string;
  type: RecallType;
  repo?: string;
  path?: string;
} {
  return {
    text: d.body.text,
    type: kindToRecallType(d.kind),
    repo: d.scope?.project,
    path: undefined,
  };
}

// ── id bridging ─────────────────────────────────────────────────────────
// Recall ids are uuids; AMP ids are `urn:amp:<base32>`. We namespace Recall
// ids so they round-trip without collision.

export function toAmpId(recallId: string): string {
  if (/^urn:amp:/.test(recallId)) return recallId;
  return "urn:amp:" + base32(recallId);
}

export function fromAmpId(ampId: string): string {
  const m = /^urn:amp:(.+)$/.exec(ampId);
  return m ? unbase32(m[1]!) : ampId;
}

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

// lowercase base32 (a-z2-7) of a utf-8 string - matches urn:amp:<base32>,
// stable and reversible so Recall uuids round-trip through AMP ids.
function base32(s: string): string {
  return base32nopad.encode(new TextEncoder().encode(s)).toLowerCase();
}
function unbase32(s: string): string {
  return new TextDecoder().decode(base32nopad.decode(s.toUpperCase()));
}
