# Changelog

## 0.1.0 — draft (unreleased)

First cut of the Agent Memory Protocol: spec + working L3 reference implementation.

### Spec
- `SPEC.md` — record format, 6 operations, 3 bindings (MCP/HTTP/file), L0–L3
  conformance, trust model (DID + signatures + capability tokens),
  mandatory injection-resistant rehydration.
- `docs/RATIONALE.md` — landscape survey + decision log.
- `docs/ADOPTION.md` — rollout plan, Recall→AMP mapping, governance.
- `src/schema/amp-record.schema.json` — JSON Schema for the record.

### Reference SDK (`@amp/core`)
- Memory Record types (`src/types.ts`).
- RFC 8785 canonicalization; BLAKE3 content hashing; Ed25519 signing with
  `did:key` identity (`src/canonical.ts`, `src/integrity.ts`, `src/id.ts`).
- `AmpServer` — the six ops + feedback, bi-temporal `revise` (supersede, never
  delete), consent-aware `forget` (`src/server.ts`).
- `InMemoryStore` reference engine; hybrid-ready `MemoryStore` interface
  (`src/store.ts`).
- Injection-resistant rehydration pipeline (`src/rehydrate.ts`).
- Bindings: MCP (`amp.*` tools), HTTP (JSON), file (`*.amp.json` / `*.amp.md`).
- `examples/round-trip.ts` — write→recall→export→import→recall across "vendors",
  signature intact.

### Docs site (`site/`)
- Astro + Starlight, distinctive ember-on-ink theme (Space Grotesk / Hanken
  Grotesk / JetBrains Mono); landing + introduction + quickstart + spec +
  conformance + ecosystem + rationale + adoption. Builds static → Cloudflare Pages.

### Naming
- Standard named **Agent Memory Protocol (AMP)** (was "Open Memory Protocol",
  which collides with an unrelated conversation-backup project). Record version
  field, URNs (`urn:amp:`), MCP tools (`amp.*`), file ext (`*.amp.json/.md`),
  and package (`@amp/core`) all renamed. Domain target: agentmemoryprotocol.io.

### L3 hardening
- Capability-scoped access tokens (`src/capability.ts`): mint/verify/authorize
  verbs × scope × expiry, signed by the owner DID; enforced in the HTTP binding.
- `subscribe` op (`AmpServer.subscribe`) + Server-Sent-Events stream
  (`GET /amp/subscribe`) for live multi-agent sharing.
- `.well-known/amp.json` discovery manifest (`src/wellknown.ts` + HTTP route).
- Structural record validation (`src/validate.ts`) enforced on `remember`.

### Conformance suite
- `runConformance()` + `pnpm conformance <url>` CLI: probes an endpoint and
  reports the highest level satisfied with a badge (`AMP 0.1 / L3`).

### Recall adapter (`adapters/recall/`)
- `map.ts` — pure Recall ↔ AMP translation (type↔kind, status, scope/visibility,
  provenance, reversible id bridging).
- `store.ts` — `RecallStore implements MemoryStore` over an injected
  `RecallBackend` (decoupled from Recall's native sqlite-vec deps): reads map
  faithfully, writes flow into Recall's capture pipeline.
- `README.md` — the ~30-line wiring for a conforming **L3** `recall amp` command
  in the Recall repo (the production server alongside the minimal reference).

### Tests
- 32 conformance + binding + L3 + adapter tests passing; `tsc --noEmit` clean.
  Reference HTTP server self-certifies **L3** via the conformance runner.

### Next
- Land the `recall amp` command inside the Recall repo (needs its native deps +
  test gate) using `adapters/recall/`.
