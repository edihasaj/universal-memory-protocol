# Contributing to UMP

Universal Memory Protocol is an open standard. Contributions to the spec, the
reference SDK, adapters, and the conformance suite are welcome.

## Ground rules

- The **spec** (`SPEC.md`) is the source of truth. Code changes that affect
  observable behavior must update the spec and the conformance suite together.
- Keep files small and focused (under ~400 lines). Prefer many small modules.
- No em dashes in prose or comments (use a hyphen).
- Reuse existing standards (W3C PROV, DID, RFC 8785) rather than inventing.

## Development

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest
pnpm build         # tsup -> dist
pnpm conformance http://localhost:4000   # probe a running endpoint
```

A change is ready when `typecheck`, `test`, and `build` are green and the
reference HTTP server still self-certifies its claimed conformance level.

## Proposing spec changes

Open an issue describing the problem and the smallest change that fixes it.
Breaking changes to the record format or the six operations require a version
bump and a migration note. Resolve the open questions in `SPEC.md` Section 8
with at least two independent implementations before promoting anything to 1.0.

## Conformance

New behavior must be covered by the conformance runner (`src/conformance.ts`)
or the test suite (`test/`). The reference implementation targets L3.
