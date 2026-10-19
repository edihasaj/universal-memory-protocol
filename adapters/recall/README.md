# Recall → UMP adapter

Serve the **Universal Memory Protocol** over [Recall](https://github.com/edihasaj/recall)'s
engine. Recall keeps its native lifecycle (hybrid retrieval, repo-quality
promotion, dedup, consolidation); UMP is the portable wire protocol on top.

This adapter is **decoupled**: it talks to a small injected `RecallBackend`
interface and never imports Recall's native (`sqlite-vec`) deps, so it builds and
tests anywhere. The real `recall ump` command supplies the backend.

## Files

- `map.ts` - pure Recall ↔ UMP translation (type↔kind, status, scope/visibility,
  provenance, reversible id bridging). Fully unit-tested.
- `store.ts` - `RecallStore implements MemoryStore`: reads map faithfully; a
  native backend implements `putRecord(record, existingId?)` to retain the
  complete UMP record. It requests enough hybrid candidates to filter scope,
  lifecycle, kind, and validity before applying the UMP result limit.

## Mapping summary

| UMP | Recall |
| --- | --- |
| kind `procedural` | type `rule` / `command` / `review_pattern` |
| kind `semantic` | type `decision` |
| kind `episodic` | type `gotcha` |
| `scope.project` | `repo` |
| `scope.visibility: shared` | scope `global` |
| `scope.visibility: private` | scope `repo` / `path` / `team` |
| `lifecycle.status` | `active` / `candidate` / (`rejected`→`tombstoned`) |
| `lifecycle.confidence` / `salience` | `confidence` |
| `provenance` | `source` + `evidence` |
| `id` `urn:ump:<base32>` | uuid (reversibly bridged) |
| `time`, structured body, relations, full scope | `capture_context.ump_record` |

The native backend is authoritative for its id, displayed text, and rejected
status. The adapter preserves the rest of `ump_record`, then strips integrity
when canonicalization changed a signed field.

### Temporal fidelity

`RecallBackend.putRecord(record, existingId?)` is required for temporal
records. It receives and persists the whole UMP record, then returns the
canonical native id. It must persist this direct UMP path without capture
auto-injection; smart capture is a separate path. `compileHybrid` receives the
UMP `filter` and `scope` and must honor its requested limit without a smaller
hidden cap. The reference adapter enumerates candidate rows for correctness;
this is an O(total rows) operation, not a benchmark of scalable temporal search.

Older backends without `putRecord` remain compatible with ordinary,
server-materialized `remember` calls and existing tombstones. They reject
explicit `created`, `observed`, `valid_from`, or `valid_to` values before
capture or direct storage, so timestamps cannot be silently flattened. Smart
capture remains available for ordinary writes; it also rejects explicit
temporal writes because capture judgement cannot guarantee a faithful record.

`revise` validates both successor and closed-prior intervals before writing. A
successor after an already-bounded prior is a legitimate gap: the earlier prior
expiry remains unchanged. The base `MemoryStore` has no multi-record
transaction, so a native backend should wrap successor and prior-closure
writes in one transaction when it can; validation failures themselves happen
before either write.

Timestamps are strict RFC 3339 values with a timezone and millisecond
precision (zero to three fractional digits). Higher precision is rejected
rather than rounded.

## Wiring `recall ump` (in the Recall repo)

Recall supplies its native backend and persisted operator identity. The SDK
does not import Recall's database or compiler. The wiring in Recall's
`src/ump/serve.ts` follows this shape:

```ts
import { UmpServer, createMcpServer } from "@universalmemoryprotocol/core";
import { RecallStore } from "@universalmemoryprotocol/core/adapters/recall";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initDb } from "../db/client.js";
import { makeRecallBackend } from "./backend.js";
import { loadPersistedUmpOperatorKey } from "./identity.js";

const db = initDb();
const key = loadPersistedUmpOperatorKey(db.$client.name);
const owner = key.did;

const ump = new UmpServer({
  name: "recall",
  version: "ump-1.0.3",
  conformance: "L1",
  store: new RecallStore(makeRecallBackend(db, owner), { owner }),
  key,
});

await createMcpServer(ump, { owner }).connect(new StdioServerTransport());
```

The server advertises L1. Supporting dated records and revisions does not by
itself certify every L2/L3 requirement, authentication or signature guarantees.
Recall's own integration tests exercise SQLite persistence and the real MCP
transport separately from this package's adapter tests.
