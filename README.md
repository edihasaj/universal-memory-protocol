# Universal Memory Protocol (UMP)

> Portable memory for AI agents. Teach one tool, recall it in the next.

**Status:** Stable v1.0 · **Site:** <https://universalmemoryprotocol.io> · **Package:** [`@universalmemoryprotocol/core`](https://www.npmjs.com/package/@universalmemoryprotocol/core) · **Bindings:** MCP, HTTP, file export

Your AI tools learn things - that this repo uses pnpm, that you like terse release
notes, the gotcha that bit you last week - then lose all of it the moment you
switch from Claude Code to Cursor to Codex. The knowledge is trapped inside
whichever tool happened to learn it.

UMP fixes that. It defines **one record format** for a memory and **six operations**
for working with it (recall, remember, get, revise, forget, feedback), with
bindings for MCP, HTTP, and plain files. Any agent or store that speaks UMP can
read and extend the same memory, so a fact you teach one tool is there for the
next one.

It is a protocol, not a product: no database to run, no service to sign up for.
The reference implementation keeps memory in a portable, signed file you own
(`~/.ump/memory.ump.json`). Copy that file and you have moved your agent's memory
to any other tool that speaks UMP.

Already have memory in CLAUDE.md/AGENTS.md, Recall exports, Obsidian, Postgres,
Redis, SQLite, or a vector DB? UMP wraps those rather than replacing them - see
[Existing Memory Imports](#existing-memory-imports) and [Store Implementations](#store-implementations).

## Use It Now

Add persistent UMP memory to any MCP host:

```jsonc
{
  "mcpServers": {
    "ump": { "command": "npx", "args": ["-y", "@universalmemoryprotocol/core", "ump-memory"] }
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

## Implement It

Use the MCP server for immediate agent integration, the TypeScript SDK for a
native UMP implementation, or the HTTP binding from any language.

```jsonc
// MCP host config: Claude Code, Codex, Cursor, or any MCP client.
{
  "mcpServers": {
    "ump": {
      "command": "npx",
      "args": ["-y", "@universalmemoryprotocol/core", "ump-memory"]
    }
  }
}
```

```ts
import {
  JsonFileStore,
  UmpServer,
  generateKeyPair,
} from "@universalmemoryprotocol/core";

const key = generateKeyPair();
const store = await JsonFileStore.open(".ump/memory.ump.json");
const ump = new UmpServer({
  name: "my-agent",
  version: "1.0.0",
  conformance: "L2",
  store,
  key,
});

await ump.remember({
  kind: "procedural",
  body: { text: "Use pnpm for this repository." },
  scope: { owner: key.did, project: "github.com/acme/app", visibility: "private" },
  provenance: { actor: key.did, actor_kind: "user", method: "user_correction" },
});

const memories = await ump.recall({
  query: "package manager",
  scope: { owner: key.did, project: "github.com/acme/app" },
});
```

```bash
# Any language: expose JSON over HTTP.
UMP_HTTP=4000 npx -y @universalmemoryprotocol/core ump-memory
```

```py
import requests

base = "http://localhost:4000"
owner = requests.get(f"{base}/.well-known/ump.json").json()["owner"]

requests.post(f"{base}/ump/remember", json={
    "kind": "semantic",
    "body": {"text": "User prefers concise release notes."},
    "scope": {"owner": owner, "project": "github.com/acme/app", "visibility": "private"},
    "provenance": {"actor": owner, "actor_kind": "user", "method": "user_correction"},
}).raise_for_status()

hits = requests.post(f"{base}/ump/recall", json={
    "query": "release note preference",
    "scope": {"owner": owner, "project": "github.com/acme/app"},
}).json()["results"]
```

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

## Audit Trail (reference-server facility)

The *protocol's* attribution lives in each record's `provenance` (who authored a
memory, how) - it travels with the record across tools. Recording *operations*
against a store (who *read* a memory, the ordered sequence of calls) is a property
of a running server, not of portable memory, so UMP leaves it to implementations -
the same way it leaves ranking and storage to implementations. It is **not** a UMP
operation and does not affect conformance (see [SPEC §9, non-normative](./SPEC.md#9-operation-auditing-non-normative)).

The reference server ships one so you get it for free: an append-only,
hash-chained, optionally signed log where any edit, insertion, or deletion is
detectable. `ump-memory` turns it on by default (`UMP_AUDIT=off` to disable).

```bash
ump audit                 # who did what, most recent first
ump audit --op forget     # filter by operation, --actor <did>, --target <id>
ump audit --verify        # recompute the hash chain end to end
```

Also over the reference bindings when enabled: MCP tools `ump.audit` /
`ump.audit.verify`, HTTP `POST /ump/audit` and `GET /ump/audit/verify`. The backend
(file, database, external SIEM) is swappable behind the `AuditLog` interface.
Note the log is server-local: it does **not** travel with an exported record - if
you need attribution to move with the memory, that is `provenance`.

## Store Implementations

`UmpServer` accepts any `MemoryStore`. The package ships dependency-light stores
for common adoption paths:

| Store | Use case |
| --- | --- |
| **`JsonFileStore`** | **Default.** Portable, signed `memory.ump.json`; fast and faithful. |
| `InMemoryStore` | Tests, examples, and ephemeral servers. |
| `MarkdownDirectoryStore` | Human-editable `*.ump.md` records. |
| `PostgresStore` | Postgres-compatible clients. |
| `SqliteStore` | SQLite-compatible clients. |
| `RedisStore` | Redis hash persistence. |
| `VectorStore` | Generic vector-backed store (e.g. sqlite-vec) + embedding fn. |
| `QdrantStore` / `PineconeStore` / `WeaviateStore` | Hosted vector clients. |
| `RecallStore` | Opt-in adapter for a Recall-backed memory engine. |

Vendor database SDKs stay outside [`@universalmemoryprotocol/core`](https://www.npmjs.com/package/@universalmemoryprotocol/core), so installing the protocol package
does not force native builds or cloud clients into every project.

### Choosing a backend

- **Default (zero-config, local):** `JsonFileStore`. In benchmarks it is the
  fastest and most faithful baseline (all 5 kinds preserved, flat ~5ms recall at
  3k records, portable signed file). This is what `ump-memory` uses by default.
- **Semantic retrieval at scale:** a **vector store** (`VectorStore` over
  sqlite-vec / Qdrant / Pinecone / Weaviate) **with embeddings enabled**, or
  `RecallStore`. These earn their extra latency only when embeddings are actually
  populated; without them you get lexical recall at higher cost than the file store.
- **Recall as engine (`RecallStore`):** opt-in semantic tier. `recall ump` warms
  a local embedding model (no API key) and serves real vector + BM25 (RRF) search
  - in benchmarks, paraphrase top-1 recall jumps from 1/8 (lexical) to 5/8. The
  cost is embedding compute (~100ms write, ~200ms recall), so reach for it when
  retrieval quality matters more than latency; otherwise `JsonFileStore` wins.

Switching is one line: point `UmpServer` at a different `MemoryStore`. The record
format, bindings, and protocol are identical across all of them.

## Existing Memory Imports

UMP stays separate from vendor-specific memory files, but [`@universalmemoryprotocol/core`](https://www.npmjs.com/package/@universalmemoryprotocol/core) includes
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

The reference protocol surface lives in [`@universalmemoryprotocol/core`](https://www.npmjs.com/package/@universalmemoryprotocol/core): schema, types, bindings,
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

## The `ump` CLI

Install once, then drive everything from one command:

```bash
npm install -g @universalmemoryprotocol/core      # provides: ump, ump-memory, ump-serve, ump-conformance, ump-import
```

```bash
ump memory                    # persistent MCP memory server (~/.ump)
ump memory --http 4000        # also expose the HTTP binding
ump memory --store markdown   # human-editable *.ump.md records
ump serve --http 4000         # ephemeral in-memory reference server
ump import --owner did:key:z... AGENTS.md CLAUDE.md
ump conformance http://localhost:4000
ump demo                      # the cross-vendor round-trip
ump --help
```

No install? Use `npx -y @universalmemoryprotocol/core ump <command>`. MCP hosts point at the bin
directly: `{ "command": "npx", "args": ["-y", "@universalmemoryprotocol/core", "ump-memory"] }`.

From a clone (no build needed):

```bash
node --experimental-strip-types src/bin/ump.ts demo
```

## Repo Layout

| Path | Purpose |
| --- | --- |
| `SPEC.md` | Protocol specification. |
| `src/` | Reference SDK/server, schema, bindings, stores, importers, and CLIs. |
| `adapters/recall/` | Recall-backed `MemoryStore` adapter. |
| `test/` | Binding, store, importer, conformance, and adapter tests. |
| `examples/` | Round-trip portability demos. |
| `docs/` | Rationale, adoption notes, and launch materials. |

## License

Protocol GitHub repository: Apache-2.0. See [LICENSE](./LICENSE).

[`@universalmemoryprotocol/core`](https://www.npmjs.com/package/@universalmemoryprotocol/core), adapters, examples, and package code are MIT. See
[LICENSE-PACKAGE](./LICENSE-PACKAGE).

Specification and documentation prose are CC-BY-4.0. See
[LICENSE-DOCS](./LICENSE-DOCS).
