---
title: "Adoption & roadmap"
description: "The path from draft to ecosystem: reference implementation, adapters, governance, and sequencing."
---


A standard is a GitHub repo until something speaks it. This is the concrete path
from draft to ecosystem, leaning on assets we already own.

---

## 1. Strategy in one line

Ship a working **reference implementation (Recall)** + **SDK** + **conformance
suite** first; make adoption cost ~an afternoon via the MCP profile; wrap existing
stores with adapters so AMP delivers value with a *single* vendor on day one.
Only then push for spec ratification. (MCP did SDKs-before-spec-evangelism; copy it.)

---

## 2. Recall as the reference implementation

Recall already implements ~80% of an L3 server. The work is exposing, not
building. Mapping:

| AMP | Recall today | Work |
|-----|--------------|------|
| `recall` op | `query` / compiler hybrid search | alias tool name + signal output shape |
| `remember` | `report_correction` / `capture_correction` | accept full record; keep pattern detection as ingest path |
| `revise` | supersession via `supersedes` field + contradiction resolve | expose as op |
| `forget` | `prune` / `reject` | add tombstone semantics + reason |
| `get` / `capabilities` | partial | thin additions |
| `feedback` | `feedback` / `signal_outcome` | rename to `amp.feedback` |
| kinds | rule/command/gotcha/decision/review_pattern | map → semantic/procedural/episodic |
| scope | session/path/repo/team/global | map → composite scope + visibility |
| provenance | evidence + capture_context + audit_trail | already PROV-shaped |
| consent | (gap) | add `consent` block; oktapod's retention classes as the model |
| integrity | sync_version (gap on crypto) | add DID owner + Ed25519 signing |
| MCP binding | full MCP server | add `amp.*` reserved tool names |
| HTTP binding | daemon `/compile` `/correct` … | add `/amp/*` aliases |
| file binding | CLAUDE.md / AGENTS.md / `.recall/context.md` | add `*.amp.json` + `*.amp.md` + `.well-known/amp.json` |

Deliverable: Recall ships an `--amp` mode advertising `AMP 0.1 / L2` (then L3),
proving the spec end-to-end and giving the ecosystem a real server to test against.

## 3. Adapters (value with one vendor, day one)

Thin shims so AMP isn't all-or-nothing:

- **Claude Code / Codex** — already MCP hosts → point them at the Recall AMP
  server; SessionStart/UserPromptSubmit hooks call `amp.recall`, corrections call
  `amp.remember`. (Recall already wires these.)
- **openclaw** (`oss/openclaw`) — implement AMP behind its `ContextEngine`
  interface: `assemble()` → `amp.recall`, `afterTurn()` → `amp.remember`. One
  adapter file.
- **oktapod** — expose its memory facet over the AMP HTTP binding; its retention
  classes + provenance already match `consent`/`provenance`.
- **ChatGPT / generic chat** — AMP HTTP binding as a custom action / connector; or
  import/export `*.amp.json` to bridge ChatGPT "saved memories" in and out.
- **Wrap, don't replace** — Mem0/Letta/Zep adapters that translate their verbs to
  AMP ops, so AMP federates existing stores instead of competing with them.

## 4. Deliverables checklist

- [ ] `amp-spec` (this repo) — SPEC + JSON Schema for the record + test vectors.
- [ ] `amp-js` / `amp-py` SDKs — client + server helpers, MCP+HTTP+file bindings.
- [ ] Conformance suite — runs L0–L3 assertions against any endpoint; emits a badge.
- [ ] Recall `--amp` reference server (L2 → L3).
- [ ] 2 adapters that interoperate (e.g. Recall ↔ openclaw) — proves portability.
- [ ] `.well-known/amp.json` discovery + a public example export.
- [ ] A "round-trip" demo: a memory written in Claude Code, recalled in Codex,
      exported to a file, re-imported into ChatGPT — the money shot.

## 5. Governance & naming

- **Name:** working title **Agent Memory Protocol (AMP)**. Descriptive, rhymes with
  MCP, signals the positioning. Alternatives if AMP collides: *Agent Memory
  Protocol (AMP — note Sourcegraph/Google AMP collision)*, codename *Engram*.
  **Open decision — Edi's call** (§7).
- **License:** spec under CC-BY-4.0; SDKs Apache-2.0/MIT. Permissive on purpose.
- **Stewardship:** start single-author for velocity, but commit publicly to neutral
  governance early (a working group / foundation track) — the difference between a
  trusted standard and a distrusted vendor spec. MCP's perceived neutrality was
  decisive; an "open" spec that one company controls gets routed around.
- **RFC process:** publish v0.1 as an RFC; resolve SPEC §8 open questions with ≥2
  independent implementations before calling anything 1.0.

## 6. Sequencing

1. **v0.1 (now):** spec + JSON Schema + Recall `--amp` (L2) + one adapter. Internal dogfood.
2. **v0.2:** SDKs + conformance suite + the round-trip demo; publish RFC; recruit a
   second external implementer.
3. **v0.3:** L3 (signing, capability tokens, rehydration), `subscribe`,
   `.well-known` discovery; submit alongside MCP/A2A ecosystem conversations.
4. **1.0:** ≥2 interop implementations across vendors; freeze the record + ops;
   move governance to a neutral steward.

## 7. Decisions for Edi

1. **Name** — go with AMP, or pick from alternatives / something new?
2. **Reference impl** — fork Recall to a clean `amp` mode, or build a minimal
   standalone reference server and keep Recall as one (richer) implementation?
3. **Ambition tier** — (a) a tight interchange + MCP profile we ship fast, or
   (b) the full negotiated protocol with signing/capability tokens aiming at
   Anthropic/OpenAI adoption? (Spec is written for (b); we can ship (a) first.)
4. **Where it lives** — `edihasaj/agent-memory-protocol` public from the start, or
   incubate private until v0.2?
