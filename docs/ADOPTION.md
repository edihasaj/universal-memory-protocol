# UMP - Adoption & Rollout

A standard is a GitHub repo until something speaks it. This is the concrete path
from draft to ecosystem, leaning on assets we already own.

---

## 1. Strategy in one line

Ship a working **reference SDK/server (`@universalmemoryprotocol/core`)** + **conformance suite**
first; use **Recall as the first rich production engine adapter**; make adoption
cost ~an afternoon via the MCP profile; wrap existing stores with adapters so UMP
delivers value with a *single* vendor on day one. Only then push for spec
ratification. (MCP did SDKs-before-spec-evangelism; copy it.)

---

## 2. Recall as the first production engine adapter

Recall already implements many L2/L3-grade memory engine behaviors. The work is
exposing those behaviors through UMP, not making Recall the protocol dependency.
Mapping:

| UMP | Recall today | Work |
|-----|--------------|------|
| `recall` op | `query` / compiler hybrid search | alias tool name + signal output shape |
| `remember` | `report_correction` / `capture_correction` | accept full record; keep pattern detection as ingest path |
| `revise` | supersession via `supersedes` field + contradiction resolve | expose as op |
| `forget` | `prune` / `reject` | add tombstone semantics + reason |
| `get` / `capabilities` | partial | thin additions |
| `feedback` | `feedback` / `signal_outcome` | rename to `ump.feedback` |
| kinds | rule/command/gotcha/decision/review_pattern | map → semantic/procedural/episodic |
| scope | session/path/repo/team/global | map → composite scope + visibility |
| provenance | evidence + capture_context + audit_trail | already PROV-shaped |
| consent | (gap) | add `consent` block; oktapod's retention classes as the model |
| integrity | sync_version (gap on crypto) | add DID owner + Ed25519 signing |
| MCP binding | full MCP server | add `ump.*` reserved tool names |
| HTTP binding | daemon `/compile` `/correct` … | add `/ump/*` aliases |
| file binding | CLAUDE.md / AGENTS.md / `.recall/context.md` | add `*.ump.json` + `*.ump.md` + `.well-known/ump.json` |

Deliverable: Recall ships an `--ump` mode advertising `UMP 1.0 / L2` (then L3),
proving the spec against a real memory engine while `@universalmemoryprotocol/core` remains the
neutral reference SDK/server.

## 3. Adapters (value with one vendor, day one)

Thin shims so UMP isn't all-or-nothing:

- **Claude Code / Codex** - already MCP hosts → point them at the Recall UMP
  server; SessionStart/UserPromptSubmit hooks call `ump.recall`, corrections call
  `ump.remember`. (Recall already wires these.)
- **openclaw** (`oss/openclaw`) - implement UMP behind its `ContextEngine`
  interface: `assemble()` → `ump.recall`, `afterTurn()` → `ump.remember`. One
  adapter file.
- **oktapod** - expose its memory facet over the UMP HTTP binding; its retention
  classes + provenance already match `consent`/`provenance`.
- **ChatGPT / generic chat** - UMP HTTP binding as a custom action / connector; or
  import/export `*.ump.json` to bridge ChatGPT "saved memories" in and out.
- **Wrap, don't replace** - Mem0/Letta/Zep adapters that translate their verbs to
  UMP ops, so UMP federates existing stores instead of competing with them.

## 4. Deliverables checklist

- [x] `ump-spec` (this repo) - SPEC + JSON Schema for the record + test vectors.
- [x] `ump-js` SDK - client + server helpers, MCP+HTTP+file bindings.
- [x] Conformance suite - runs L0-L3 assertions against any endpoint; emits a badge.
- [x] Recall `ump` production engine adapter (L2).
- [x] Recall Cloud independent Python/HTTP/MCP implementation (L1 core + forget).
- [ ] 2 adapters that interoperate (e.g. Recall ↔ openclaw) - proves portability.
- [x] `.well-known/ump.json` discovery.
- [x] A "round-trip" demo: a memory written in one agent, exported as a
  portable file, and recalled by a second agent.

## 5. Governance

- **Name:** **Universal Memory Protocol (UMP)**. Descriptive, adjacent to MCP,
  and clear about the missing interop layer: memory.
- **License:** Apache-2.0 for the protocol GitHub repository; MIT for the
  `@universalmemoryprotocol/core` npm package, adapters, examples, and package code; CC-BY-4.0 for
  documentation prose.
- **Stewardship:** start single-author for velocity, but commit publicly to neutral
  governance early (a working group / foundation track) - the difference between a
  trusted standard and a distrusted vendor spec. MCP's perceived neutrality was
  decisive; an "open" spec that one company controls gets routed around.
- **RFC process:** UMP 1.0 freezes the record and six core operations after
  validation in the TypeScript reference server, Recall, and Recall Cloud.
  Additive extensions require conformance vectors and implementation evidence.
  Breaking changes require the next major version.

## 6. Sequencing

1. **v0.1:** spec + JSON Schema + first Recall adapter.
2. **v0.2:** SDK, conformance suite, round-trip demo, and operation auditing.
3. **v1.0:** stable record and six-operation contract, signed reference
   implementation, legacy `0.1` import compatibility, Recall and Recall Cloud
   implementations.
4. **Post-1.0:** additional language SDKs, independent adopters, and neutral
   working-group governance.

## 7. Remaining decisions

1. **Implementation split** - keep `@universalmemoryprotocol/core` as the minimal standalone
   reference server and Recall as one richer production implementation?
2. **Ambition tier** - (a) a tight interchange + MCP profile we ship fast, or
   (b) the full negotiated protocol with signing/capability tokens aiming at
   Anthropic/OpenAI adoption? (Spec is written for (b); we can ship (a) first.)
3. **Stewardship path** - when to move from single-repo velocity to a working
   group or foundation-style governance model.
