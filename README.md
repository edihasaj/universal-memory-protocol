# Universal Memory Protocol (UMP)

> A portable memory protocol for AI agents.

**Status:** Draft v0.1 · **Package:** `@ump/core` · **Bindings:** MCP, HTTP, file export

UMP standardizes how agents read, write, revise, forget, and exchange memory
across tools, runtimes, and storage engines. It is not a database and it is not a
single memory product. It is a small protocol surface, a portable signed record
format, and reference SDK/server code that any agent harness or memory backend
can implement.

## Use It Now

Add persistent UMP memory to any MCP host:

```jsonc
{
  "mcpServers": {
    "ump": { "command": "npx", "args": ["-y", "@ump/core", "ump-memory"] }
  }
}
```

The server exposes:

- `ump.capabilities`
- `ump.recall`
- `ump.remember`
- `ump.get`
- `ump.revise`
- `ump.forget`
- `ump.feedback`

By default, `ump-memory` stores portable records in `~/.ump/memory.ump.json`.
Set `UMP_STORE=markdown` to store human-editable `*.ump.md` records instead.

## Why UMP Exists

Agent memory is fragmented. Claude Code, Codex, ChatGPT, local agents, memory
engines, and framework-specific stores all use different verbs, record shapes,
scope rules, export formats, and retention behavior. That creates lock-in and
makes memory hard to audit, migrate, or share across agents.

UMP gives the ecosystem one interoperable contract:

```text
portable record format + 6 core operations + MCP/HTTP/file bindings
```

MCP standardizes tool access. A2A standardizes agent coordination. UMP
standardizes memory portability.

## What UMP Standardizes

UMP standardizes the parts that must match for memory to travel:

- record shape: kind, body, scope, time, lifecycle, relations, provenance,
  consent, integrity
- operations: capability negotiation, recall, remember, get, revise, forget
- bindings: MCP tools, HTTP endpoints, JSON/Markdown file exports
- conformance: L0 through L3 so implementers can adopt incrementally
- safety: supersession instead of destructive updates, consent-aware export,
  scoped retrieval, signed records at the full tier

UMP deliberately does not standardize the retrieval algorithm, embedding model,
database, ranking policy, summarization strategy, or consolidation engine. Those
remain implementation choices.

## Core Operations

| Operation | Purpose |
| --- | --- |
| `capabilities` | Negotiate supported kinds, bindings, conformance, limits, and signals. |
| `recall` | Search memory by query, scope, filters, and time. |
| `remember` | Write a new memory, or merge it if the store chooses. |
| `get` | Fetch a memory by id. |
| `revise` | Supersede a memory while preserving history. |
| `forget` | Tombstone a memory with a reason. |

Optional full-tier operations:

| Operation | Purpose |
| --- | --- |
| `feedback` | Report whether a recalled memory was followed, ignored, overridden, or contradicted. |
| `subscribe` | Stream memory changes where supported. |

## Conformance Levels

| Level | Requirement |
| --- | --- |
| L0 | Portable `*.ump.json` or `*.ump.md` records. No server required. |
| L1 | `capabilities`, `recall`, `remember`, and `get`. |
| L2 | `revise`, `forget`, bi-temporal validity, provenance, scope, and consent. |
| L3 | Feedback, subscribe, signed integrity, capability-scoped tokens, and contradiction relations. |

Run the conformance probe against an HTTP endpoint:

```bash
pnpm conformance http://localhost:4000
```

## Store Implementations

`UmpServer` accepts any `MemoryStore`. The package ships dependency-light stores
for common adoption paths:

| Store | Use case |
| --- | --- |
| `InMemoryStore` | Tests, examples, and ephemeral servers. |
| `JsonFileStore` | Local persistent `memory.ump.json` records. |
| `MarkdownDirectoryStore` | Human-editable `*.ump.md` records. |
| `PostgresStore` | Postgres-compatible clients. |
| `SqliteStore` | SQLite-compatible clients. |
| `RedisStore` | Redis hash persistence. |
| `VectorStore` | Generic vector-backed store wrapper. |
| `QdrantStore` | Qdrant-style vector clients. |
| `PineconeStore` | Pinecone-style vector clients. |
| `WeaviateStore` | Weaviate-style vector clients. |
| `RecallStore` | Adapter for a Recall-backed memory engine. |

Vendor database SDKs stay outside `@ump/core`, so installing the protocol package
does not force native builds or cloud clients into every project.

## Existing Memory Imports

UMP stays separate from vendor-specific memory files, but `@ump/core` includes
import helpers so users can migrate existing memory into portable UMP records.

```bash
node --experimental-strip-types src/bin/import.ts \
  --owner did:key:zYourOwner \
  --project github.com/example/repo \
  --out .ump/import.ump.json \
  CLAUDE.md AGENTS.md ~/Documents/main
```

Supported source kinds:

| Source kind | Input |
| --- | --- |
| `claude` | `CLAUDE.md` style instructions. |
| `agents` | `AGENTS.md` style repo or agent instructions. |
| `recall` | Recall exports and context files. |
| `obsidian` | Obsidian-style vault folders and notes. |
| `generic_markdown` | Any Markdown file or directory. |

Importers emit UMP `MemoryDraft` records with source provenance such as
`filesystem:claude`. They are migration bridges, not protocol requirements.

## Recall's Role

Recall is one implementation target: a rich memory engine that can be exposed
through UMP via `RecallStore`. It is not the protocol, not a required dependency,
and not the only valid backend.

The reference protocol surface lives in `@ump/core`: schema, types, bindings,
server helpers, stores, importers, and conformance tests. Recall exists to prove
that UMP can wrap a production-grade memory engine without making the standard
vendor-specific.

## Run Locally

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Useful commands:

```bash
node --experimental-strip-types examples/round-trip.ts
node --experimental-strip-types src/bin/memory.ts
UMP_STORE=markdown node --experimental-strip-types src/bin/memory.ts
UMP_HTTP=4000 node --experimental-strip-types src/bin/serve.ts
node --experimental-strip-types src/bin/import.ts --owner did:key:z... CLAUDE.md AGENTS.md
```

## Repo Layout

| Path | Purpose |
| --- | --- |
| `SPEC.md` | Draft protocol specification. |
| `src/` | Reference SDK/server, schema, bindings, stores, importers, and CLIs. |
| `adapters/recall/` | Recall-backed `MemoryStore` adapter. |
| `test/` | Binding, store, importer, conformance, and adapter tests. |
| `examples/` | Round-trip portability demos. |
| `docs/` | Rationale, adoption notes, and launch materials. |

## License

Protocol GitHub repository: Apache-2.0. See [LICENSE](./LICENSE).

`@ump/core`, adapters, examples, and package code are MIT. See
[LICENSE-PACKAGE](./LICENSE-PACKAGE).

Specification and documentation prose are CC-BY-4.0. See
[LICENSE-DOCS](./LICENSE-DOCS).
