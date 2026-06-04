# Agent Memory Protocol (AMP)

> The portable memory layer for AI agents. What MCP did for tools, AMP does for memory.

**Status:** Draft v0.1 (design proposal) · **Reference implementation:** [Recall](https://github.com/edihasaj/recall)

---

## The one-paragraph pitch

Every agent harness — Claude Code, Codex, ChatGPT, and the open-source long tail
(openclaw, oktapod, LangGraph, Letta…) — is reinventing memory in a private,
non-portable way. Your corrections, preferences, and project knowledge are
trapped inside whichever tool learned them. **AMP is an open standard for how
agents read, write, and exchange memory** — a small set of negotiated operations
over a portable, signed, bi-temporal record format. Any harness can speak it; any
store can serve it; the user owns and can export the result.

## Why now, and why this shape

Three things are true in 2026:

1. **MCP has no memory primitive.** It standardized *tools, resources, prompts* —
   not memory. "Memory" today is just a bespoke tool surface bolted onto MCP, with
   different verbs in every product (`add_memories`, `core_memory_append`,
   `/memories` CRUD…). No interop.
2. **The interchange formats (PAM, MIF) are static files.** Great schemas, but no
   runtime, no negotiation, no access control. They describe a memory; they don't
   let two agents *talk* about memory.
3. **The data model has already converged.** Independently, Recall, oktapod,
   openclaw, Letta, Zep, LangMem, Mem0 all landed on the same ingredients:
   typed memories, hybrid retrieval, hierarchical scopes, provenance,
   supersession-over-deletion, consolidation. The hard design work is *done* — it
   just isn't *standardized*.

So AMP does **not** invent a new wire protocol. The lesson of MCP is *minimal
primitives + ride existing rails + great SDKs + neutral governance*. AMP is:

```
  ┌─────────────────────────────────────────────────────────┐
  │  AMP = Portable Record Format  +  6 operations  +        │
  │        3 bindings (MCP profile / HTTP / file export)     │
  └─────────────────────────────────────────────────────────┘
```

It rides MCP's transport (so Claude/Codex/any MCP client speaks it with zero new
infra), reuses W3C PROV + DID + the PAM/MIF schema for the record, and adds the
one thing nobody owns: **the negotiated, access-controlled runtime in the middle.**

## Where AMP sits

| Layer        | Standard | What it carries            |
|--------------|----------|----------------------------|
| Tools        | **MCP**  | callable functions, resources |
| Coordination | **A2A**  | agent-to-agent invocation  |
| **Memory**   | **AMP**  | **portable knowledge across sessions, agents, and vendors** |

AMP sits *beside* MCP and A2A, not on top. It is the third leg.

## The six operations

| Op | Purpose |
|----|---------|
| `capabilities` | Negotiate: which kinds, bindings, conformance level, retrieval signals a peer supports |
| `recall`       | Search memory by query + scope → ranked records with per-result signals |
| `remember`     | Write a new memory (or merge into an existing one) |
| `get`          | Fetch a memory by id |
| `revise`       | Supersede/update a memory — **never destructive**, history preserved |
| `forget`       | Tombstone a memory with a reason — honors consent/retention |

Plus two optional Full-tier ops: `feedback` (was an injected memory followed,
overridden, ignored, contradicted?) and `subscribe` (push updates).

That's the whole surface. A conforming client is ~100 lines.

## Conformance levels (adopt incrementally)

- **L0 — Portable Record:** read/write the `*.amp.json` / `*.amp.md` file format. No server.
- **L1 — Core:** `capabilities` + `recall` + `remember` + `get`.
- **L2 — Standard:** adds `revise` + `forget`, bi-temporal validity, provenance, scope + consent.
- **L3 — Full:** adds `feedback` + `subscribe`, signed integrity, capability-scoped tokens, contradiction relations.

A repo can ship a `.amp/` export (L0) the same day; a harness can wire the MCP
profile (L1) in an afternoon.

## Repo layout

- **[SPEC.md](./SPEC.md)** — the draft standard: record schema, operations, bindings, conformance, trust.
- **[docs/RATIONALE.md](./docs/RATIONALE.md)** — landscape survey + every design decision and why.
- **[docs/ADOPTION.md](./docs/ADOPTION.md)** — rollout: Recall as reference impl, adapters, governance, the path to Anthropic/OpenAI.
- **`src/`** — `@amp/core`, the reference SDK + L3 server (canonicalization, DID/Ed25519 signing, the six ops, three bindings).
- **`examples/round-trip.ts`** — write→recall→export→import→recall across "vendors", signature intact.
- **`site/`** — the documentation site ([Astro Starlight](https://starlight.astro.build) → Cloudflare Pages). See [site/README.md](./site/README.md).

## Run it

```bash
pnpm install
pnpm test                                              # 20 conformance + binding tests
node --experimental-strip-types examples/round-trip.ts # the cross-vendor demo
AMP_HTTP=4000 node --experimental-strip-types src/bin/serve.ts  # MCP stdio + HTTP
cd site && pnpm install && pnpm dev                    # docs site at :4321
```

## Name & domains

Canonical name **Agent Memory Protocol (AMP)**; the third interop layer beside
*Model Context Protocol* and *Agent2Agent*. Primary domain
**agentmemoryprotocol.io** (`.org`/`.dev`/`.ai` available to reserve). The name
"Open Memory Protocol" is intentionally avoided — it belongs to a separate
conversation-transcript-backup project (see [docs/RATIONALE.md](./docs/RATIONALE.md)).

## License

Spec: CC-BY-4.0 (proposed). Reference SDKs: Apache-2.0/MIT dual (proposed).
Neutral stewardship intended — see ADOPTION.md.
