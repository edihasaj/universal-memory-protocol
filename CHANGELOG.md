# Changelog

## Unreleased

## 1.0.0 - 2026-07-30

### Stable protocol
- Freeze the portable record shape and six core operations as UMP 1.0.
- Emit `ump: "1.0"` from the SDK, MCP/HTTP/file bindings, schema, discovery,
  audit events, and conformance tooling.
- Accept UMP 0.1 portable records and capability tokens as explicit migration
  inputs, then normalize records to UMP 1.0 before re-emitting them.
- Reject unknown protocol and capability-token versions.
- Document semantic versioning and post-1.0 extension rules.
- Record the TypeScript reference server, Recall, and Recall Cloud as the
  implementations used to validate the stable contract.

## 0.2.0 - 2026-07-11

### Added
- **`revise`/`forget` actor attribution (protocol/provenance).** These operations
  now accept an optional `actor` and stamp the acting principal into the
  successor/tombstone `provenance`, so record lineage stays attributable across
  tools. Provenance is the portable, in-record attribution UMP guarantees.
- **Operation audit log (reference-server facility, non-normative).** The
  reference server ships an optional append-only, hash-chained, optionally signed
  log of every operation - reads included - queryable by op, actor, target, scope,
  and time. It is **not** a UMP operation and does not affect conformance (see
  SPEC §9): it is server-local and does not travel with exported records.
  - `AuditLog` interface with `InMemoryAuditLog` and file-backed `JsonlAuditLog`;
    `UmpServer` gains `audit()` / `verifyAudit()` / non-logging `peek()`.
  - Exposed only when enabled: MCP `ump.audit` / `ump.audit.verify` tools, HTTP
    `POST /ump/audit` and `GET /ump/audit/verify`, `ump audit [--verify]` CLI.
    `ump-memory` enables it at `~/.ump/audit.log.jsonl` by default (`UMP_AUDIT=off`).
- `signHash` / `verifyHash` helpers shared by record and audit signing.

## 0.1.0 - draft (unreleased)

First cut of the Universal Memory Protocol: spec + working L3 reference implementation.

### Launch kit
- `ump-memory` bin - a one-command **persistent** MCP memory server for any host
  (`npx -y @universalmemoryprotocol/core ump-memory`): `JsonFileStore` at `~/.ump/memory.ump.json`
  plus a **stable operator key** (`~/.ump/key.json`), so records stay owned and
  signed across restarts. MCP stdio by default; `UMP_HTTP` for the HTTP binding.
- `GOVERNANCE.md` - neutral-stewardship intent + the path to a working group.
- `docs/launch/` - Show HN draft, X thread, 90s demo script, distribution checklist.
- README + docs site lead with the "Use it now" MCP one-liner.

### Spec
- `SPEC.md` - record format, 6 operations, 3 bindings (MCP/HTTP/file), L0-L3
  conformance, trust model (DID + signatures + capability tokens),
  mandatory injection-resistant rehydration.
- `docs/RATIONALE.md` - landscape survey + decision log.
- `docs/ADOPTION.md` - rollout plan, Recall→UMP mapping, governance.
- `src/schema/ump-record.schema.json` - JSON Schema for the record.

### Reference SDK (`@universalmemoryprotocol/core`)
- Memory Record types (`src/types.ts`).
- RFC 8785 canonicalization; BLAKE3 content hashing; Ed25519 signing with
  `did:key` identity (`src/canonical.ts`, `src/integrity.ts`, `src/id.ts`).
- `UmpServer` - the six ops + feedback, bi-temporal `revise` (supersede, never
  delete), consent-aware `forget` (`src/server.ts`).
- `InMemoryStore` reference engine; hybrid-ready `MemoryStore` interface
  (`src/store.ts`).
- Injection-resistant rehydration pipeline (`src/rehydrate.ts`).
- Bindings: MCP (`ump.*` tools), HTTP (JSON), file (`*.ump.json` / `*.ump.md`).
- `examples/round-trip.ts` - write→recall→export→import→recall across "vendors",
  signature intact.

### Docs site (`site/`)
- Astro + Starlight, distinctive ember-on-ink theme (Space Grotesk / Hanken
  Grotesk / JetBrains Mono); landing + introduction + quickstart + spec +
  conformance + ecosystem + rationale + adoption. Builds static → Cloudflare Pages.

### Naming
- Standard named **Universal Memory Protocol (UMP)** (was "Open Memory Protocol",
  which collides with an unrelated conversation-backup project). Record version
  field, URNs (`urn:ump:`), MCP tools (`ump.*`), file ext (`*.ump.json/.md`),
  and package (`@universalmemoryprotocol/core`) all renamed. Domain target: universalmemoryprotocol.io.

### L3 hardening
- Capability-scoped access tokens (`src/capability.ts`): mint/verify/authorize
  verbs × scope × expiry, signed by the owner DID; enforced in the HTTP binding.
- `subscribe` op (`UmpServer.subscribe`) + Server-Sent-Events stream
  (`GET /ump/subscribe`) for live multi-agent sharing.
- `.well-known/ump.json` discovery manifest (`src/wellknown.ts` + HTTP route).
- Structural record validation (`src/validate.ts`) enforced on `remember`.

### Conformance suite
- `runConformance()` + `pnpm conformance <url>` CLI: probes an endpoint and
  reports the highest level satisfied with a badge (`UMP 0.1 / L3`).

### Recall adapter (`adapters/recall/`)
- `map.ts` - pure Recall ↔ UMP translation (type↔kind, status, scope/visibility,
  provenance, reversible id bridging).
- `store.ts` - `RecallStore implements MemoryStore` over an injected
  `RecallBackend` (decoupled from Recall's native sqlite-vec deps): reads map
  faithfully, writes flow into Recall's capture pipeline.
- `README.md` - the ~30-line wiring for a conforming **L3** `recall ump` command
  in the Recall repo (the production server alongside the minimal reference).

### Tests
- 32 conformance + binding + L3 + adapter tests passing; `tsc --noEmit` clean.
  Reference HTTP server self-certifies **L3** via the conformance runner.

### Next
- Land the `recall ump` command inside the Recall repo (needs its native deps +
  test gate) using `adapters/recall/`.
