# Universal Memory Protocol (UMP)

> The portable memory layer for AI agents. What MCP did for tools, UMP does for memory.

**Status:** Draft v0.1 (design proposal) · **Reference implementation:** [Recall](https://github.com/edihasaj/recall)

---

## The one-paragraph pitch

Every agent harness - Claude Code, Codex, ChatGPT, and the open-source long tail
(openclaw, oktapod, LangGraph, Letta…) - is reinventing memory in a private,
non-portable way. Your corrections, preferences, and project knowledge are
trapped inside whichever tool learned them. **UMP is an open standard for how
agents read, write, and exchange memory** - a small set of negotiated operations
over a portable, signed, bi-temporal record format. Any harness can speak it; any
store can serve it; the user owns and can export the result.

## Use it now (any MCP host)

Add persistent, portable memory to Claude Code, Cursor, Codex, or any MCP host in
one line. Add to your MCP client config:

```jsonc
{
  "mcpServers": {
    "ump": { "command": "npx", "args": ["-y", "@ump/core", "ump-memory"] }
  }
}
```

The agent gets `ump.remember` / `ump.recall` (plus `get/revise/forget/feedback`).
Memory persists to `~/.ump/memory.ump.json` as a portable, signed file - switch
tools, point the next one at the same store (or its export), and your agent keeps
everything it learned. That portability is the whole point.

## Why now, and why this shape

Three things are true in 2026:

1. **MCP has no memory primitive.** It standardized *tools, resources, prompts* -
   not memory. "Memory" today is just a bespoke tool surface bolted onto MCP, with
   different verbs in every product (`add_memories`, `core_memory_append`,
   `/memories` CRUD…). No interop.
2. **The interchange formats (PAM, MIF) are static files.** Great schemas, but no
   runtime, no negotiation, no access control. They describe a memory; they don't
   let two agents *talk* about memory.
3. **The data model has already converged.** Independently, Recall, oktapod,
   openclaw, Letta, Zep, LangMem, Mem0 all landed on the same ingredients:
   typed memories, hybrid retrieval, hierarchical scopes, provenance,
   supersession-over-deletion, consolidation. The hard design work is *done* - it
   just isn't *standardized*.

So UMP does **not** invent a new wire protocol. The lesson of MCP is *minimal
primitives + ride existing rails + great SDKs + neutral governance*. UMP is:

```
  ┌─────────────────────────────────────────────────────────┐
  │  UMP = Portable Record Format  +  6 operations  +        │
  │        3 bindings (MCP profile / HTTP / file export)     │
  └─────────────────────────────────────────────────────────┘
```

It rides MCP's transport (so Claude/Codex/any MCP client speaks it with zero new
infra), reuses W3C PROV + DID + the PAM/MIF schema for the record, and adds the
one thing nobody owns: **the negotiated, access-controlled runtime in the middle.**

## Where UMP sits

| Layer        | Standard | What it carries            |
|--------------|----------|----------------------------|
| Tools        | **MCP**  | callable functions, resources |
| Coordination | **A2A**  | agent-to-agent invocation  |
| **Memory**   | **UMP**  | **portable knowledge across sessions, agents, and vendors** |

UMP sits *beside* MCP and A2A, not on top. It is the third leg.

## The six operations

| Op | Purpose |
|----|---------|
| `capabilities` | Negotiate: which kinds, bindings, conformance level, retrieval signals a peer supports |
| `recall`       | Search memory by query + scope → ranked records with per-result signals |
| `remember`     | Write a new memory (or merge into an existing one) |
| `get`          | Fetch a memory by id |
| `revise`       | Supersede/update a memory - **never destructive**, history preserved |
| `forget`       | Tombstone a memory with a reason - honors consent/retention |

Plus two optional Full-tier ops: `feedback` (was an injected memory followed,
overridden, ignored, contradicted?) and `subscribe` (push updates).

That's the whole surface. A conforming client is ~100 lines.

## Conformance levels (adopt incrementally)

- **L0 - Portable Record:** read/write the `*.ump.json` / `*.ump.md` file format. No server.
- **L1 - Core:** `capabilities` + `recall` + `remember` + `get`.
- **L2 - Standard:** adds `revise` + `forget`, bi-temporal validity, provenance, scope + consent.
- **L3 - Full:** adds `feedback` + `subscribe`, signed integrity, capability-scoped tokens, contradiction relations.

A repo can ship a `.ump/` export (L0) the same day; a harness can wire the MCP
profile (L1) in an afternoon.

## Repo layout

- **[SPEC.md](./SPEC.md)** - the draft standard: record schema, operations, bindings, conformance, trust.
- **[docs/RATIONALE.md](./docs/RATIONALE.md)** - landscape survey + every design decision and why.
- **[docs/ADOPTION.md](./docs/ADOPTION.md)** - rollout: Recall as reference impl, adapters, governance, the path to Anthropic/OpenAI.
- **`src/`** - `@ump/core`, the reference SDK + minimal server (canonicalization, DID/Ed25519 signing, the six ops, three bindings).
- **Stores** - in-memory, JSON file, Markdown directory, Postgres, SQLite,
  Redis, and BYO vector DB clients for Qdrant/Pinecone/Weaviate-style engines.
- **`adapters/recall/`** - serve UMP over [Recall](https://github.com/edihasaj/recall)'s engine.
- **`examples/round-trip.ts`** - write, recall, export, import across "vendors", signature intact.
- **docs site** - lives in a separate repo (`universal-memory-protocol-docs`, Astro Starlight, deploys to Cloudflare Pages).

## Run it

```bash
pnpm install
pnpm typecheck                                          # tsc --noEmit
pnpm test                                               # conformance + binding tests
pnpm build                                              # tsup -> dist (esm + d.ts + bins)
node --experimental-strip-types examples/round-trip.ts  # the cross-vendor demo
UMP_HTTP=4000 node --experimental-strip-types src/bin/serve.ts  # MCP stdio + HTTP
node --experimental-strip-types src/bin/memory.ts               # persistent ~/.ump server
UMP_STORE=markdown node --experimental-strip-types src/bin/memory.ts
pnpm conformance http://localhost:4000                  # report the endpoint's proven conformance level
```

## Store implementations

`UmpServer` accepts any `MemoryStore`. The package ships dependency-light
implementations for common adoption paths:

| Store | Use case |
| --- | --- |
| `InMemoryStore` | tests, examples, ephemeral reference server |
| `JsonFileStore` | local persistent `memory.ump.json` export |
| `MarkdownDirectoryStore` | human-editable `*.ump.md` files |
| `PostgresStore` | `pg`/Postgres-compatible client |
| `SqliteStore` | `better-sqlite3` / `node:sqlite`-style client |
| `RedisStore` | Redis hash persistence |
| `VectorStore` / `QdrantStore` / `PineconeStore` / `WeaviateStore` | BYO vector DB client + embedding function |

Vendor clients stay outside `@ump/core`, so adding UMP does not force native
builds or cloud SDKs into every install.

## Name & domains

Canonical name **Universal Memory Protocol (UMP)**; the third interop layer beside
*Model Context Protocol* and *Agent2Agent*. Primary domain
**universalmemoryprotocol.io** (`.org`/`.dev`/`.ai` available to reserve). The name
"Open Memory Protocol" is intentionally avoided - it belongs to a separate
conversation-transcript-backup project (see [docs/RATIONALE.md](./docs/RATIONALE.md)).

## License

Code (`@ump/core`, adapters, examples): **Apache-2.0** (see [LICENSE](./LICENSE)).
Spec prose (`SPEC.md`): **CC-BY-4.0** (proposed). Neutral stewardship intended;
see [docs/ADOPTION.md](./docs/ADOPTION.md).
