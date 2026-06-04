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

### Tests
- 20 conformance + binding tests passing; `tsc --noEmit` clean.

### Next
- Recall `--amp` mode (the richer, production conforming server) per ADOPTION §2.
- `subscribe` op + capability-token enforcement; `.well-known/amp.json` discovery.
