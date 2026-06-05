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
- `store.ts` - `RecallStore implements MemoryStore`: reads map faithfully; writes
  flow into Recall's capture pipeline (text → candidate memory), which is the
  correct behavior when Recall is the engine.

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

## Wiring `recall ump` (in the Recall repo)

Add `@ump/core` as a dependency, then mount the adapter over Recall's existing
modules. The backend is ~30 lines bridging Recall's functions:

```ts
import { UmpServer, generateKeyPair, createMcpServer, createHttpServer } from "@ump/core";
import { RecallStore, type RecallBackend } from "@ump/core/adapters/recall/store";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Recall's own modules:
import { openDb } from "../db";
import { queryMemories, getMemory } from "../models/memory";
import { compileContextHybrid } from "../compiler/context";
import { processCorrection } from "../capture/correction";

const db = openDb();
const owner = loadOrCreateOperatorDid();           // did:key from Recall config

const backend: RecallBackend = {
  queryMemories: (f) => queryMemories(db, { repo: f.repo }),
  getMemory: (id) => getMemory(db, id),
  compileHybrid: async ({ query, repo, limit }) => {
    const ctx = await compileContextHybrid(db, { repo, query_text: query, config: { max_rules: limit } });
    return ctx.memories.map((m) => ({ memory: m, score: m.score ?? m.confidence }));
  },
  capture: async ({ text, repo }) =>
    processCorrection(db, text, { repo, sessionId: "ump", source: "ump_remember" }),
};

const ump = new UmpServer({
  name: "recall", version: RECALL_VERSION, conformance: "L3",
  store: new RecallStore(backend, { owner: { did: owner } as any }),
  key: operatorKeyPair,                            // sign on write (L3)
});

// expose over MCP (primary) and/or HTTP
if (process.env.UMP_HTTP) createHttpServer(ump, { wellKnown: { owner } }).listen(Number(process.env.UMP_HTTP));
await createMcpServer(ump).connect(new StdioServerTransport());
```

That makes Recall a conforming **L3** UMP server - the production-grade
implementation alongside `@ump/core`'s minimal reference. `feedback` maps to
Recall's `feedback`/`signal_outcome`; `revise`/`forget` map to Recall's
supersession and `prune`/`reject`.

> Status: the mapping + store are implemented and tested here against a fake
> backend. The final wiring lives in the Recall repo (it needs Recall's native
> deps + its own test gate) and is a small, well-scoped follow-up.
