# Universal Memory Protocol - Specification

**Version:** 1.0 · **Status:** stable

This document specifies UMP: a portable record format and a set of negotiated
operations for reading, writing, and exchanging agent memory across harnesses,
stores, and vendors.

The key words MUST, SHOULD, MAY are used per RFC 2119.

---

## 1. Design constraints

UMP is bound by five constraints, in priority order. Every decision below traces
to one of these.

1. **Minimal surface.** Six operations, one record type. If it can live in an
   engine instead of the wire, it does.
2. **Ride existing rails.** Primary binding is an MCP profile - no new transport.
   Secondary bindings (HTTP, file) reuse HTTP and Markdown/JSON.
3. **Don't invent the data model.** Reuse W3C PROV (provenance), W3C DID
   (identity), and the converged PAM/MIF/LangMem vocabulary (types, scopes).
4. **User-owned and portable.** The operator - not the model vendor - owns,
   signs, and can export every record. No opaque lock-in.
5. **Safe by construction.** Memory is attacker-controllable input. Staleness is
   handled by supersession, not deletion. Rehydration is injection-resistant by
   mandate, not by advice.

---

## 2. The Memory Record

The record is the atom of UMP. Every binding moves records; every operation
produces or consumes them. It is transport-neutral JSON; an equivalent Markdown
projection is defined in §6.3.

```jsonc
{
  "ump": "1.0",                          // REQUIRED. spec version
  "id": "urn:ump:jbswy3dpehpk3pxp",      // REQUIRED. stable, globally unique
  "kind": "semantic",                    // REQUIRED. see §2.1
  "body": {                              // REQUIRED. the memory itself
    "text": "Use pnpm, never npm, in this repo.",
    "structured": { }                    // OPTIONAL. machine-readable payload
  },

  "scope": {                             // REQUIRED. who/where this applies (§2.2)
    "owner": "did:key:z6Mk…",            // REQUIRED. the operator's DID
    "user": "did:key:z6Mk…",             // OPTIONAL. subject, if not the owner
    "project": "github.com/example/project",
    "agent": "claude-code",              // OPTIONAL. producing/consuming agent
    "session": "sess_abc",               // OPTIONAL. session binding
    "visibility": "private"              // private | shared | public
  },

  "time": {                              // REQUIRED. bi-temporal (§2.3)
    "created": "2026-06-04T10:00:00Z",   // when the record was authored
    "observed": "2026-06-04T09:58:00Z",  // when the fact was learned
    "valid_from": "2026-06-04T00:00:00Z",
    "valid_to": null                     // null = still valid
  },

  "lifecycle": {                         // OPTIONAL. engine-facing hints (§2.4)
    "confidence": 0.82,                  // 0..1
    "salience": 0.6,                     // 0..1, importance for ranking
    "decay": "half_life:P90D",           // OPTIONAL. decay model hint
    "status": "active"                   // active | candidate | tombstoned
  },

  "supersedes": ["urn:ump:1a…"],         // OPTIONAL. ids this replaces
  "superseded_by": [],                   // set by engine on revise

  "relations": [                         // OPTIONAL. typed links (§2.5)
    { "type": "contradicts", "target": "urn:ump:7b…" },
    { "type": "about",       "target": "entity:pnpm" }
  ],

  "provenance": {                        // REQUIRED at L2+. W3C PROV-aligned (§2.6)
    "actor": "did:key:z6Mk…",            // who/what asserted this
    "actor_kind": "user",                // user | agent | model | import | scan
    "method": "user_correction",
    "source": { "ref": "sess_abc#turn_12" },
    "evidence": [ { "ref": "sess_abc#turn_12", "weight": 1.0 } ]
  },

  "consent": {                           // OPTIONAL but RECOMMENDED. policy (§2.7)
    "retention": "P365D",                // ISO-8601 duration; max time to keep
    "exportable": true,
    "redact": ["body.structured.token"]  // JSON-paths to strip on export/share
  },

  "integrity": {                         // OPTIONAL at L2, REQUIRED at L3 (§2.8)
    "content_hash": "blake3:5e…",
    "signature": "ed25519:9c…",
    "signer": "did:key:z6Mk…"
  }
}
```

### 2.1 Kinds

Five kinds, from the converged taxonomy (LangMem/MemoryOS). A consumer MUST
accept all five and MAY ignore kinds it does not use.

| kind | meaning | example |
|------|---------|---------|
| `semantic`   | durable facts/preferences | "prefers pnpm" |
| `episodic`   | a specific past event | "on 2026-06-01 the deploy failed because of X" |
| `procedural` | how-to / behavioral rule | "always run `pnpm gate` before handoff" |
| `working`    | short-lived task context | "currently refactoring the auth module" |
| `identity`   | who the user/agent is | "operator prefers concise handoffs" |

### 2.2 Scope

Scope is a *composition*, not a single key. Retrieval relevance is a function of
how well a record's scope matches the query context (§3.2). `owner` is always a
DID so memory is portable across vendors and verifiable. Visibility:

- `private` - only the owner's agents.
- `shared` - explicitly granted peers (capability token, §5.2).
- `public` - anyone (e.g. a published "how this OSS repo builds" memory).

### 2.3 Bi-temporal time (the staleness fix)

Every record carries **two timelines**: *valid time* (`valid_from`/`valid_to`,
when the fact is true in the world) and *transaction time* (`created`/`observed`,
when the system learned it). This is the only credible answer to the canonical
failure - "user's employer is correct until they change jobs, then confidently
wrong." A fact is never deleted on change; `valid_to` is set and a successor is
linked via `supersedes`. History is queryable. (Model from Zep/Graphiti.)

### 2.4 Lifecycle hints

`confidence`, `salience`, `decay`, `status` are **engine-facing hints**, not
normative semantics. UMP deliberately does **not** standardize promotion logic or
decay curves - those are where engines compete (Recall's repo-quality gating,
MemoryOS's FIFO tiers). Standardizing them would make the wire brittle. Consumers
MAY use them for ranking; producers SHOULD set them when known.

### 2.5 Relations

A small open vocabulary; consumers MAY ignore unknown types. Reserved:
`about` (subject/entity), `contradicts`, `depends_on`, `derived_from`,
`duplicate_of`. `target` is a record `urn:ump:…` or an `entity:<name>` node. This
is the seam for knowledge-graph engines (Recall/oktapod entity graphs) without
mandating one.

### 2.6 Provenance

Aligned to **W3C PROV** (`actor` = Agent, `method`/`source` = Activity,
`evidence` = derivation). Required at L2+ because trust in multi-agent memory
depends on knowing *who asserted what, how*. `actor_kind=import` carries a
`source.provider` so cross-vendor imports stay attributable.

### 2.7 Consent

The privacy gap nobody else specifies, made machine-readable and *in the record*:
`retention` (max keep duration), `exportable`, `redact` (JSON-paths stripped on
export/share). A conforming store MUST honor `retention` (tombstone on expiry)
and MUST apply `redact` before emitting a record across a `visibility` boundary.

### 2.8 Integrity

Content-addressed (`blake3` of canonicalized record minus `integrity`) and signed
by the **operator's** DID key - explicitly *not* the model vendor's. This is the
ownership moat: a memory is tamper-evident and provably the user's, independent of
where it's stored. Optional at L2 (interop without crypto), REQUIRED at L3.

### 2.9 Admission and responsibility

UMP begins at the portable-memory boundary. Extraction, review, approval, and
other admission workflows happen before or around `remember` and remain
implementation policy. A server MAY require such a workflow and reject records
that do not pass it.

Neither a successful `remember` nor `lifecycle.status=active` proves that a
record is true, reviewed, or approved. Likewise, an `integrity` signature proves
who signed the final record and that its bytes have not changed; it does not by
itself prove the record's factual correctness or the meaning of an upstream
approval.

`lifecycle.status=candidate` is an engine-facing confidence or promotion hint,
not a consent, authorization, or pending-review state. Consumers MAY recall
candidate records. A system that permits reuse only after confirmation MUST
enforce that gate as policy rather than infer approval from a lifecycle value.

When an admission result needs to travel with a record, producers SHOULD:

1. put the responsible actor and outcome in `provenance.actor` and
   `provenance.method`;
2. reference the signed review or responsibility artifact from
   `provenance.source` / `provenance.evidence`;
3. place profile-specific machine-readable details under `body.structured`; and
4. sign the finalized record only after those fields are populated.

This preserves UMP's small wire format while allowing responsibility systems to
export confirmed records. See
[`examples/responsibility-confirmed.ump.json`](./examples/responsibility-confirmed.ump.json).

---

## 3. Operations

Six operations. Each is defined abstractly here; §4 maps them onto bindings.
Requests/responses are JSON objects. Errors use a `{ "error": { code, message } }`
envelope with codes from §3.7.

### 3.1 `capabilities`

Negotiation handshake. No memory side effects.

```jsonc
// → request
{ "client": { "name": "claude-code", "ump": "1.0" } }
// ← response
{
  "server": { "name": "recall", "version": "1.4.0" },
  "ump": "1.0",
  "conformance": "L3",
  "kinds": ["semantic","episodic","procedural","working","identity"],
  "bindings": ["mcp","http","file"],
  "retrieval_signals": ["similarity","recency","salience","scope_match","provenance_depth"],
  "max_recall": 50,
  "writable": true,
  "audit": true                 // non-normative: server offers an audit facility (§9)
}
```

A peer MUST call `capabilities` (or read it from MCP tool/Resource listing)
before assuming any optional feature.

### 3.2 `recall`

The workhorse. Search by query + scope; return ranked records with per-result
signals so the client can re-rank or explain.

```jsonc
// → request
{
  "query": "package manager for this repo",
  "scope": { "owner": "did:key:z6Mk…", "project": "…/recall", "agent": "claude-code" },
  "filter": { "kind": ["semantic","procedural"], "valid_at": "2026-06-04T10:00:00Z" },
  "limit": 8,
  "ranking_hints": { "prefer": ["recency"] }   // OPTIONAL client steer
}
// ← response
{
  "results": [
    {
      "record": { /* §2 Memory Record */ },
      "signals": { "similarity": 0.91, "recency": 0.7, "salience": 0.6,
                   "scope_match": 1.0, "provenance_depth": 2 },
      "score": 0.88
    }
  ]
}
```

Retrieval is **engine-agnostic**: UMP standardizes the *interface and the signal
names*, not the algorithm (vector, BM25, hybrid, graph-walk all conform). Servers
SHOULD honor `valid_at` for point-in-time (bi-temporal) queries. The default
`valid_at` is "now".

### 3.3 `remember`

Write a memory. The server MAY merge into an existing record (returning its id)
per its own dedup policy; it MUST report which.

```jsonc
// → request: a partial Memory Record (server fills id/time/integrity if omitted)
{ "record": { "kind":"procedural", "body":{"text":"run pnpm gate before handoff"},
              "scope":{ "owner":"did:…","project":"…/recall" },
              "provenance":{ "actor":"did:…","actor_kind":"user","method":"user_correction" } } }
// ← response
{ "id": "urn:ump:…", "result": "created" }   // created | merged | rejected
```

A server MUST reject (not silently store) records that fail consent/policy or, at
L3, signature verification.

### 3.4 `get`

```jsonc
{ "id": "urn:ump:…" }            // → { "record": { … } } | error not_found
```

### 3.5 `revise`

Non-destructive update. Creates a successor that `supersedes` the prior; sets the
prior's `valid_to` and `superseded_by`. The old record remains queryable with
`valid_at` in the past.

```jsonc
{ "id": "urn:ump:1a…", "patch": { "body": { "text": "Use bun, not pnpm." },
                                  "time": { "valid_from": "2026-06-04T10:00:00Z" } } }
// ← { "id": "urn:ump:NEW…", "supersedes": ["urn:ump:1a…"] }
```

### 3.6 `forget`

Tombstone with a reason. The record's `status` becomes `tombstoned`; it is
excluded from default `recall` but retained for audit unless `consent.retention`
or an explicit `hard:true` (owner-only) demands erasure.

```jsonc
{ "id":"urn:ump:…", "reason":"user_revoked", "hard": false }   // → { "result":"tombstoned" }
```

### 3.7 Errors

`unauthorized`, `forbidden_scope`, `not_found`, `invalid_record`,
`consent_violation`, `signature_invalid`, `unsupported`, `rate_limited`.

### 3.8 Optional Full-tier ops

- `feedback` - report an injected memory's outcome
  (`followed|overridden|ignored|contradicted`) so the serving engine can learn.
  (Directly maps to Recall's `feedback`/`signal_outcome`.)
- `subscribe` - long-lived stream of record changes in a scope (for live
  multi-agent sharing). Binding-specific (MCP notifications / SSE).

---

## 4. Bindings

One abstract protocol, three concrete carriers. A server advertises which it
speaks via `capabilities.bindings`.

### 4.1 MCP profile (PRIMARY)

The whole point: any MCP client speaks UMP with no new transport.

- Each operation is exposed as an **MCP tool** with a reserved name:
  `ump.capabilities`, `ump.recall`, `ump.remember`, `ump.get`, `ump.revise`,
  `ump.forget`, and (L3) `ump.feedback`. Tool input/output schemas are §3.
- Stored memories MAY also be exposed as **MCP Resources** under the `ump://`
  URI scheme (`ump://{project}/{id}`) for read-only browsing.
- `capabilities` is derivable from the tool list, so a minimal server can skip
  the explicit tool and just expose the others.

Because Claude Code, Codex, and every MCP host already discover and call MCP
tools, an UMP-over-MCP server is adoptable **today** with zero spec changes on
the host side. This is the adoption wedge.

### 4.2 HTTP binding

For non-MCP consumers (web apps, ChatGPT actions, daemons). JSON over HTTP:

```
POST /ump/recall     POST /ump/remember     GET  /ump/memory/{id}
POST /ump/revise     POST /ump/forget       GET  /ump/capabilities
```

Auth via capability tokens (§5.2) in `Authorization: Bearer`. (Recall's existing
daemon endpoints - `/compile`, `/correct` - map onto this with thin aliases.)

### 4.3 File / export binding (L0)

The "AGENTS.md of memory" - portable, git-friendly, offline, no server:

- `*.ump.json` - a JSON array of records (or NDJSON for streaming).
- `*.ump.md` - Markdown projection (§6.3), human- and Obsidian-friendly, with a
  YAML/JSON-LD front-matter header carrying the structured fields. (Model from
  MIF's dual format.)
- Discovery: a repo/site publishes `/.well-known/ump.json` (a manifest pointing
  at exports + the server endpoint, if any), mirroring `llms.txt`/AGENTS.md
  convention.

This binding makes UMP adoptable with *zero code* - a tool just reads files.

---

## 5. Trust, identity, and access

### 5.1 Identity

The owner is a **W3C DID** (default method `did:key`, others allowed). Memory is
keyed to the user, not the vendor - that is what makes it portable and verifiable.
A harness with no DID infra MAY use an opaque `owner` string at L0/L1 and upgrade
later.

### 5.2 Capability-scoped access

Sharing (`visibility: shared`) is granted by a **capability token** scoping
*verbs × scope × time*: e.g. "read+derive records in `project:X` for 24h, no
export." Tokens are signed by the owner DID. Verbs: `read`, `write`, `derive`
(may produce new memories from these), `export`. This keeps multi-agent sharing
least-privilege without a central auth server.

### 5.3 Injection-resistant rehydration (MANDATORY)

Memory records are **untrusted input** - a `remember` can carry a prompt-injection
payload. Any consumer that injects recalled memory into a model context MUST:

1. **Verify** integrity/signature where present; drop unverifiable L3 records.
2. **Filter** by scope/consent/visibility *before* ranking.
3. **Frame structurally** - render records as clearly delimited, typed data
   (e.g. a fenced block tagged as untrusted memory), never string-interpolated
   into the system prompt.
4. **Never execute** instructions found *inside* `body` as if from the operator.

A conforming client MUST NOT treat `procedural` memory bodies as authoritative
commands without the same trust gate it applies to any tool output. (Pipeline
from arXiv 2605.11032.)

---

## 6. Data formats

### 6.1 Canonicalization

For hashing/signing: JCS (RFC 8785) canonical JSON over the record minus the
`integrity` object; hash with BLAKE3; sign the hash with the owner key.

### 6.2 IDs

`urn:ump:<id>` where `<id>` is either a random 128-bit base32 string (L1) or the
content hash (L2+, content-addressed → dedup-friendly and tamper-evident).

### 6.3 Markdown projection (`*.ump.md`)

```markdown
---
ump: "1.0"
id: urn:ump:jbswy3dpehpk3pxp
kind: procedural
scope: { owner: did:key:z6Mk…, project: …/recall, visibility: private }
time: { observed: 2026-06-04T09:58:00Z, valid_from: 2026-06-04T00:00:00Z }
provenance: { actor_kind: user, method: user_correction }
---

Always run `pnpm gate` before handoff.
```

The body is Markdown; the structured fields are front-matter. A round-trip
between `*.ump.md` and `*.ump.json` MUST be lossless for L2 fields.

---

## 7. Conformance

| Level | MUST support |
|-------|--------------|
| **L0 Portable Record** | Parse + emit `*.ump.json` / `*.ump.md`; honor `consent.redact` on export. |
| **L1 Core** | L0 + `capabilities`, `recall`, `remember`, `get`; all 5 kinds; one binding. |
| **L2 Standard** | L1 + `revise`, `forget`; bi-temporal `valid_at`; provenance; scope + consent enforcement. |
| **L3 Full** | L2 + `feedback`, `subscribe`; integrity verify on read & sign on write; capability tokens; injection-resistant rehydration. |

A product states e.g. "UMP 1.0 / L2 / MCP+file bindings". Test vectors and a
conformance suite ship with the reference implementation (see ADOPTION.md).

---

## 8. Versioning and extensions

UMP uses `major.minor` protocol versions. A conforming implementation MUST emit
records using the version it advertises through `capabilities.ump`. It MUST
reject an unknown major version rather than silently reinterpret the record.
Minor releases are additive and MUST preserve every field and operation defined
by the preceding minor release.

UMP 1.0 implementations MAY import UMP 0.1 portable records as a migration
bridge. When they do, they MUST normalize the imported record to `ump: "1.0"`
before emitting, signing, or persisting it again. This compatibility rule does
not make `0.1` a negotiated runtime version.

The 1.0 record shape and six core operations are frozen. Candidate post-1.0
extensions include:

1. **Entity graph**: standardize an `entity:` node format, or keep it engine-only
   behind `relations`? (Recall + oktapod both have rich graphs.)
2. **Embeddings**: store raw text + source-model only (re-embed downstream, per
   MIF), or also allow shipping vectors with a model tag?
3. **Consolidation/"rethinking"**: out of scope (engine-side) - or a standard
   optional `consolidate` op so any harness can trigger another's maintenance?
4. **Decay**: keep as opaque hint, or define 2-3 named decay models for portability?
5. **Additional SDKs**: standard client/server helpers beyond TypeScript.

---

## 9. Operation auditing (non-normative)

This section is **non-normative**. Auditing is an *implementation* concern, like
the retrieval algorithm (§3.2) and the store backend (§2.4): UMP does not define
audit operations, an audit wire format, or an audit conformance requirement.
Nothing here changes the record, the six operations, or any conformance level.

**What is in the protocol** is `provenance` (§2.6): the portable, in-record record
of *who authored a memory, how*. Because provenance travels inside the record, it
survives export and crosses vendors - that is UMP's attribution guarantee. A
`revise` or `forget` MAY stamp the acting principal into the successor/tombstone
`provenance`, so record lineage stays attributable across tools.

**What is out of the protocol** is a log of *operations* against a store - who
*read* a memory, and the ordered sequence of calls over time. Provenance cannot
express that; it is answered by a server-side operation log. Such a log is a
property of a running server, not of the portable memory, so it is left to
implementations - the same way UMP leaves ranking and storage to implementations.

The reference implementation ships one such facility so operators get it for free:
an append-only, hash-chained, optionally operator-signed log, queryable via the
`ump.audit` / `ump.audit.verify` MCP tools and the `POST /ump/audit` /
`GET /ump/audit/verify` HTTP routes, behind a swappable `AuditLog` interface
(memory, appended file, or a database). Servers that offer it MAY advertise
`capabilities.audit: true`. See the reference docs, not this spec, for its shape.

*Caveat, by design:* an operation log is **server-local and does not travel** with
an exported record. If you need attribution to move with the memory, that lives in
`provenance`, not the log.
