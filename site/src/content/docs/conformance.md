---
title: Conformance
description: The four conformance levels and what each requires.
---

AMP is **adopted incrementally**. A repository can publish an `*.amp.json` export
the same day; a harness can wire the MCP profile in an afternoon; a production
store can implement the full signed, access-controlled runtime when ready.

A product states its conformance as, e.g., *"AMP 0.1 / L2 / MCP+file bindings".*

## Levels

| Level | MUST support |
| --- | --- |
| **L0 — Portable Record** | Parse + emit `*.amp.json` / `*.amp.md`; honor `consent.redact` on export. No server required. |
| **L1 — Core** | L0 + `capabilities`, `recall`, `remember`, `get`; all five kinds; at least one binding. |
| **L2 — Standard** | L1 + `revise`, `forget`; bi-temporal `valid_at`; provenance; scope + consent enforcement. |
| **L3 — Full** | L2 + `feedback`, `subscribe`; integrity verify on read & sign on write; capability tokens; injection-resistant rehydration. |

## The five kinds

Every conforming consumer MUST accept all five record kinds and MAY ignore kinds
it does not use:

- **semantic** — durable facts/preferences
- **episodic** — specific past events
- **procedural** — how-to / behavioral rules
- **working** — short-lived task context
- **identity** — who the user/agent is

## Reference implementation

`@amp/core` targets **L3** and ships all three bindings (MCP, HTTP, file). It is
the canonical server to test against. A conformance suite that runs the L0–L3
assertions against any endpoint is on the [roadmap](/adoption/).

See the full normative requirements in the
[Specification §7](/specification/#7-conformance).
