/**
 * Universal Memory Protocol - record & operation types (UMP 1.0).
 * Mirrors SPEC.md §2 (record) and §3 (operations). Transport-neutral.
 */

export const UMP_VERSION = "1.0" as const;
export const LEGACY_UMP_VERSIONS = ["0.1"] as const;
export type LegacyUmpVersion = (typeof LEGACY_UMP_VERSIONS)[number];
export type SupportedUmpVersion = typeof UMP_VERSION | LegacyUmpVersion;

export function isSupportedUmpVersion(value: unknown): value is SupportedUmpVersion {
  return value === UMP_VERSION ||
    LEGACY_UMP_VERSIONS.includes(value as LegacyUmpVersion);
}

export type MemoryKind =
  | "semantic"
  | "episodic"
  | "procedural"
  | "working"
  | "identity";

export type Visibility = "private" | "shared" | "public";

export type MemoryStatus = "active" | "candidate" | "tombstoned";

export type ActorKind = "user" | "agent" | "model" | "import" | "scan";

/**
 * Who is performing an operation. Optional on every op. Used to attribute a
 * `revise`/`forget` in the record's `provenance` (the portable, in-protocol
 * attribution) and, where a server keeps one, its operation log (SPEC §9,
 * non-normative). A hardened deployment derives this from the verified
 * capability token (§5.2) rather than trusting a caller-supplied value.
 */
export interface AuditActor {
  did?: string;
  kind?: ActorKind;
}

export interface MemoryBody {
  text: string;
  /** Optional machine-readable payload. */
  structured?: Record<string, unknown>;
}

export interface MemoryScope {
  /** Operator DID. REQUIRED. Memory is keyed to the user, not the vendor. */
  owner: string;
  /** Subject DID, if different from owner. */
  user?: string;
  project?: string;
  agent?: string;
  session?: string;
  visibility: Visibility;
}

export interface MemoryTime {
  /** When the record was authored. */
  created: string;
  /** When the fact was learned. */
  observed?: string;
  /** Valid-time window start. */
  valid_from?: string;
  /** Valid-time window end; null = still valid. */
  valid_to?: string | null;
}

export interface MemoryLifecycle {
  confidence?: number;
  salience?: number;
  /** Opaque decay hint, e.g. "half_life:P90D". Engine-interpreted. */
  decay?: string;
  status?: MemoryStatus;
}

export type RelationType =
  | "about"
  | "contradicts"
  | "depends_on"
  | "derived_from"
  | "duplicate_of"
  | (string & {});

export interface Relation {
  type: RelationType;
  /** A record `urn:ump:…` or an `entity:<name>` node. */
  target: string;
}

export interface EvidenceRef {
  ref: string;
  weight?: number;
}

export interface Provenance {
  actor: string;
  actor_kind: ActorKind;
  method: string;
  source?: { ref?: string; provider?: string };
  evidence?: EvidenceRef[];
}

export interface Consent {
  /** ISO-8601 duration; max time to retain. */
  retention?: string;
  exportable?: boolean;
  /** JSON-paths to strip when crossing a visibility boundary. */
  redact?: string[];
}

export interface Integrity {
  content_hash: string;
  signature: string;
  signer: string;
}

export interface MemoryRecord {
  ump: typeof UMP_VERSION;
  id: string;
  kind: MemoryKind;
  body: MemoryBody;
  scope: MemoryScope;
  time: MemoryTime;
  lifecycle?: MemoryLifecycle;
  supersedes?: string[];
  superseded_by?: string[];
  relations?: Relation[];
  provenance?: Provenance;
  consent?: Consent;
  integrity?: Integrity;
}

/** A record with server-managed fields optional (input to `remember`). */
export type MemoryDraft = Omit<MemoryRecord, "ump" | "id" | "time"> & {
  /** UMP 0.1 is accepted as an import compatibility format. Servers emit 1.0. */
  ump?: SupportedUmpVersion;
  id?: string;
  time?: Partial<MemoryTime>;
};

// ── Operations (SPEC §3) ────────────────────────────────────────────────

export type ConformanceLevel = "L0" | "L1" | "L2" | "L3";

export interface Capabilities {
  server: { name: string; version: string };
  ump: typeof UMP_VERSION;
  conformance: ConformanceLevel;
  kinds: MemoryKind[];
  bindings: Array<"mcp" | "http" | "file">;
  retrieval_signals: string[];
  max_recall: number;
  writable: boolean;
  /** True when the server records an audit trail queryable via `audit` (§9). */
  audit?: boolean;
}

export interface RecallRequest {
  query: string;
  scope?: Partial<MemoryScope>;
  filter?: { kind?: MemoryKind[]; valid_at?: string; status?: MemoryStatus[] };
  limit?: number;
  ranking_hints?: { prefer?: string[] };
  /** Who is performing this read, for the audit trail (§9). */
  actor?: AuditActor;
}

export interface RecallResult {
  record: MemoryRecord;
  signals: Record<string, number>;
  score: number;
}

export interface RecallResponse {
  results: RecallResult[];
}

export interface RememberResponse {
  id: string;
  result: "created" | "merged" | "rejected";
  reason?: string;
}

export interface ReviseRequest {
  id: string;
  patch: Partial<Pick<MemoryRecord, "body" | "lifecycle" | "relations">> & {
    time?: Partial<MemoryTime>;
  };
  /** Who is performing this revision; stamped into the successor's provenance
   * and the audit trail (§9). */
  actor?: AuditActor;
}

export interface ReviseResponse {
  id: string;
  supersedes: string[];
}

export interface ForgetRequest {
  id: string;
  reason: string;
  /** Owner-only hard erasure. Default false = tombstone + retain for audit. */
  hard?: boolean;
  /** Who is performing this forget; recorded in the audit trail (§9). */
  actor?: AuditActor;
}

export type FeedbackOutcome =
  | "followed"
  | "overridden"
  | "ignored"
  | "contradicted";

export interface FeedbackRequest {
  id: string;
  outcome: FeedbackOutcome;
  session?: string;
  /** Who is reporting this outcome; recorded in the audit trail (§9). */
  actor?: AuditActor;
}

export type UmpErrorCode =
  | "unauthorized"
  | "forbidden_scope"
  | "not_found"
  | "invalid_record"
  | "consent_violation"
  | "signature_invalid"
  | "unsupported"
  | "rate_limited";

export class UmpError extends Error {
  code: UmpErrorCode;
  constructor(code: UmpErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "UmpError";
  }
}
