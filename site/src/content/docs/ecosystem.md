---
title: Ecosystem & positioning
description: How AMP relates to MCP, A2A, and the existing agent-memory and conversation-portability efforts.
---

AMP is designed to **compose with** the emerging agent stack, not compete with it.

## Complementary standards

| Standard | Layer | Relationship to AMP |
| --- | --- | --- |
| **MCP** (Model Context Protocol) | Tools | AMP's primary binding *is* an MCP profile. AMP rides MCP's transport. |
| **A2A** (Agent2Agent) | Coordination | A2A moves work between agents; AMP is the memory they share and carry. |
| **W3C PROV / DID** | Provenance & identity | Reused directly for AMP provenance and operator identity — not reinvented. |
| **OAuth 2.0** | Auth | Capability tokens can be carried over standard bearer auth. |

## Where AMP differs from existing memory work

The memory space already has **runtime tool-surfaces** (each with proprietary
verbs), **storage engines**, and **interchange formats** (static files). What it
lacks is a **negotiated, access-controlled runtime protocol with an MCP binding**.
That is AMP's lane.

| Approach | Examples | What it is | What AMP adds |
| --- | --- | --- | --- |
| Runtime tool-surfaces | Mem0/OpenMemory, Letta blocks, vendor memory tools | Useful CRUD+search, but proprietary verbs per product | One negotiated verb set any host speaks |
| Storage / retrieval engines | temporal KGs, tiered memory OSes | Great recall quality | A standard *interface* so engines compete underneath |
| Interchange formats | PAM, MIF, conversation-backup specs | Portable *files* — no runtime, negotiation, or access control | The runtime middle: capabilities, scoping, consent, signing |

### A note on "Open Memory Protocol"

There is a separate project named *Open Memory Protocol* focused on **AI
conversation backup and portability** — exporting and migrating raw chat
transcripts (`.zip` archives) between consumer products. That solves a real but
distinct problem: moving *transcripts*. AMP is about the **live memory runtime** —
the distilled, typed knowledge agents read and write *during* a task, with
bi-temporal validity, provenance, signing, and injection-resistant rehydration.
Different layer; the two could even interoperate (transcripts in, distilled
memory out).

## What AMP deliberately leaves to engines

AMP standardizes **structure, provenance, access, and trust**. It does **not**
standardize:

- extraction / salience (what's worth remembering),
- ranking algorithms (vector, BM25, graph, hybrid — all conform),
- decay curves or promotion logic,
- consolidation / "rethinking".

Encoding those into the wire format would make it brittle and slow to ratify.
They are where implementations compete — AMP only standardizes the *interface*
and the *ranking signals* they report.
