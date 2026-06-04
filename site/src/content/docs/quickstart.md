---
title: Quickstart
description: Install the reference SDK, run the cross-vendor round-trip, and wire the MCP binding.
---

The reference implementation (`@amp/core`) is a working **L3** server: did:key
signing, the six operations, bi-temporal revise, consent enforcement, and
injection-resistant rehydration — over MCP, HTTP, and file bindings.

## Install & test

```bash
git clone https://github.com/edihasaj/agent-memory-protocol
cd agent-memory-protocol
pnpm install
pnpm test          # conformance + binding tests
pnpm typecheck
```

## The cross-vendor round-trip

A memory written by one agent, recalled by another, exported to a portable file,
re-imported into a third server — signature intact across "vendors".

```bash
node --experimental-strip-types examples/round-trip.ts
```

```ts
import { AmpServer, InMemoryStore, generateKeyPair, rehydrate, file } from "@amp/core";

const owner = generateKeyPair();

// Agent A (e.g. Claude Code) writes a correction — signed, content-addressed.
const a = new AmpServer({ name: "claude-code", version: "1", store: new InMemoryStore(), key: owner });
const { id } = await a.remember({
  kind: "procedural",
  body: { text: "Always run `pnpm gate` before handoff in this repo." },
  scope: { owner: owner.did, project: "edihasaj/recall", agent: "claude-code", visibility: "private" },
  provenance: { actor: owner.did, actor_kind: "user", method: "user_correction" },
});

// Export to the portable file format and import into Agent B (e.g. Codex).
const exported = file.exportRecords((await a.recall({ query: "handoff", scope: { owner: owner.did } })).results.map(r => r.record));
const b = new AmpServer({ name: "codex", version: "1", store: new InMemoryStore() });
for (const rec of file.fromJson(file.toJson(exported))) await b.remember(rec);

// B recalls it and rehydrates into context — safely framed as untrusted data.
const hit = await b.recall({ query: "what should I do before I hand off?", scope: { owner: owner.did } });
const { text } = rehydrate(hit.results);
console.log(text);
```

## Run the reference server

```bash
# MCP over stdio (any MCP host can attach):
node --experimental-strip-types src/bin/serve.ts

# Add the HTTP binding too:
AMP_HTTP=4000 node --experimental-strip-types src/bin/serve.ts
```

## Wire the MCP binding into an agent

The MCP binding exposes the operations as reserved tools — `amp.capabilities`,
`amp.recall`, `amp.remember`, `amp.get`, `amp.revise`, `amp.forget`,
`amp.feedback`. Point any MCP host at the server and the agent can recall on
`SessionStart` / per-turn and remember on corrections.

```jsonc
// example MCP client config
{
  "mcpServers": {
    "amp": {
      "command": "node",
      "args": ["--experimental-strip-types", "src/bin/serve.ts"]
    }
  }
}
```

:::caution[Recalled memory is untrusted input]
Anything stored via `amp.remember` can carry a prompt-injection payload. A
conforming consumer **must** verify → filter → frame recalled records (see
[Specification §5.3](/specification/#53-injection-resistant-rehydration-mandatory))
and must never execute instructions found inside a memory body.
:::
