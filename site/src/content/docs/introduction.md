---
title: Introduction
description: What the Agent Memory Protocol is, the gap it fills, and how it relates to MCP and A2A.
---

**Agent Memory Protocol (AMP)** is an open standard for how AI agents read,
write, and exchange memory — a small set of negotiated operations over a
portable, signed, bi-temporal record format. Any harness can speak it; any store
can serve it; the user owns and can export the result.

## The problem

Every agent harness — Claude Code, Codex, ChatGPT, and the open-source long tail
— is reinventing memory in a private, non-portable way. Your corrections,
preferences, and project knowledge are trapped inside whichever tool learned
them. There is no shared way for an agent to recall what another agent already
knows about you, or for you to take your memory with you when you switch tools.

## The gap

Three things are true today:

1. **MCP has no memory primitive.** It standardized *tools, resources, prompts* —
   not memory. "Memory" is just a bespoke tool surface bolted onto MCP, with
   different verbs in every product.
2. **The interchange formats are static files.** Several portable-memory schemas
   exist, but they describe a memory — they don't let two agents *talk* about
   memory. No runtime, no negotiation, no access control.
3. **The data model has already converged.** Independent systems landed on the
   same ingredients: typed memories, hybrid retrieval, hierarchical scopes,
   provenance, supersession-over-deletion, consolidation. The hard design work is
   done — it just isn't standardized.

**Nobody owns the negotiated runtime in the middle.** That is what AMP provides.

## Where AMP sits

| Layer | Standard | What it carries |
| --- | --- | --- |
| Tools | **MCP** | callable functions, resources |
| Coordination | **A2A** | agent-to-agent invocation |
| **Memory** | **AMP** | **portable knowledge across sessions, agents, and vendors** |

AMP sits *beside* MCP and A2A, not on top. It is the third leg.

## Design in one line

```
AMP = Portable Record Format  +  6 operations  +  3 bindings (MCP / HTTP / file)
```

It rides MCP's transport (so any MCP client speaks it with zero new infra),
reuses W3C PROV + DID for provenance and identity, and adds the one thing nobody
owns: the negotiated, access-controlled runtime.

Continue to the [Quickstart](/quickstart/) to run it, or jump to the
[Specification](/specification/).
