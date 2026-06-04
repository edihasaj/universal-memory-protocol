---
title: "Rationale & landscape"
description: "Why AMP is shaped the way it is: prior art, the converged data model, and the decision log."
---


Why AMP is shaped the way it is. This captures the prior art it stands on and the
specific decision behind each part of the spec, so reviewers can attack the
reasoning, not just the surface.

---

## 1. The landscape (2024–2026)

### 1.1 MCP — the template, and the gap

MCP (Anthropic) won by being small: JSON-RPC 2.0 + three primitives (**tools,
resources, prompts**) + two transports (stdio, Streamable HTTP) + great
multi-language SDKs + neutral-ish governance. Cross-vendor adoption (OpenAI,
Google, Microsoft, Cloudflare) came in ~4 months — driven by SDKs, not the prose.

**MCP has no memory primitive.** The only "memory" is community *servers* — the
reference `server-memory` is a single-device knowledge graph (entities/relations/
observations). Memory is a tool surface bolted on, with different verbs per
product. → **AMP's gap: the protocol middle nobody owns.**

*Lessons copied:* minimal primitive count; ride the transport; SDKs are the
product; capability negotiation; neutral governance. (SPEC §1, §4.1.)

### 1.2 Runtime memory systems (proprietary verbs)

| System | Data model | Interface | Lesson taken |
|--------|-----------|-----------|--------------|
| **Mem0 / OpenMemory** | typed memory objects; vector+relational+entity; scopes `user/agent/run/app` | MCP server, `add/search/list/delete` | tiny CRUD+search is enough to be cross-client; **scope composition is a retrieval input** (SPEC §2.2, §3.2) |
| **Letta / MemGPT** | OS-style tiers: core (pinned self-editable *blocks*) / recall / archival | self-edit tools, sleep-time compute | the **labeled, bounded, agent-editable unit**; memory = "which tokens enter context" → rehydration matters (SPEC §5.3) |
| **Zep / Graphiti** | **bi-temporal** knowledge graph; 4 timestamps; provenance | hybrid search; conflicts *invalidate, never delete* | **bi-temporal + supersession is THE staleness answer** (SPEC §2.3, §3.5) |
| **MemoryOS / MIRIX** (2025 research) | short/mid/long tiers; active retrieval | — | tiering + agentic retrieval beat flat RAG; but keep tiering **engine-side** (SPEC §2.4) |
| **LangMem / LangGraph** | semantic / episodic / procedural over namespaced store | `BaseStore` | **the type taxonomy is the de-facto vocabulary** → adopt it (SPEC §2.1) |
| **OpenAI Responses/Conversations** | server-side conversation state (`store`, `previous_response_id`) | proprietary, non-exportable | conversation-state ≠ memory; **opaque storage is the lock-in users resent** (SPEC §1 constraint 4) |
| **Anthropic memory tool (2025)** | `/memories` files Claude CRUDs; **client-hosted** | beta tool + context editing | **memory-as-files + client-owned storage** is a clean ownership model; pairs with compaction (SPEC §4.3) |

### 1.3 Interchange formats & the closest prior art

- **PAM (Portable AI Memory)** — "vCard for AI memories." JSON, 11 types, SHA-256
  hashes, validity periods, supersession, confidence+decay, provenance,
  Ed25519/DID signatures, incremental adoption. *Limit: static file, no runtime.*
- **MIF (Memory Interchange Format)** — dual Markdown + JSON-LD, 3 conformance
  levels, W3C PROV, bi-temporal, model-agnostic embeddings (store source model +
  raw text), hierarchical namespaces. *Gap: no contradiction handling.*
- **arXiv 2605.11032 "Portable Agent Memory"** — a *protocol*, not just a format:
  5 components, Merkle-DAG + BLAKE3 content-addressing, **operator-signed roots**,
  capability-scoped tokens, and an **injection-resistant rehydration pipeline**
  (Verify→Filter→Rank→Compress→Format→Frame→Inject). *Closest thing to this idea.*

**AMP's move:** PAM/MIF give the record schema for free; the arXiv paper gives the
trust model. AMP differentiates by being the **negotiated, access-controlled
runtime** with an **MCP binding** — which none of the three have. (SPEC §4.1.)

### 1.4 Adjacent standards reused (not reinvented)

W3C **PROV** (provenance, §2.6), W3C **DID** (identity, §5.1), **JCS/RFC 8785**
(canonicalization, §6.1), **AGENTS.md / llms.txt** (`.well-known/amp.json`
discovery convention, §4.3). Positioned beside **A2A** (coordination) and **MCP**
(tools) as the third interop layer.

---

## 2. What our own repos proved

Three independent codebases in `~/Projects` already converged on AMP's model —
strong evidence the abstractions are real, not invented:

**Recall** (`recall/`) — the reference implementation candidate. Already has:
typed memories (rule/command/gotcha/decision/review_pattern → map to AMP kinds),
hierarchical scopes (session/path/repo/team/global), confidence-based lifecycle,
evidence/provenance, contradiction detection, hybrid retrieval (sqlite-vec + FTS
with a relevance floor), entity graph with N-hop walk, feedback signals
(followed/overridden/ignored/contradicted), a maintenance/"rethinking" task queue,
and — critically — **all three AMP bindings already exist**: MCP server, HTTP
daemon, and CLAUDE.md/AGENTS.md/`.recall/context.md` file exports. Recall is ~80%
of an L3 server; AMP is largely *naming and exposing* what it does.

**oktapod** (`oktapod/`) — proves the trust/governance side: provenance-tracked
memory writes (recall_id, trace_id, policy reason, confidence), **retention
classes** (ephemeral/default/long_term/compliance → AMP `consent.retention`),
policy-gated writes, semantic graph with salience. Confirms consent + provenance
belong *in the record*.

**openclaw** (`oss/openclaw/`) — proves the runtime/lifecycle side: a pluggable
`ContextEngine` interface (bootstrap/ingest/assemble/compact/afterTurn) and
subagent spawn/teardown hooks. Confirms AMP must define lifecycle/rehydration as
an interface, and that the engine (retrieval, compaction) must stay swappable
*under* the protocol (SPEC §2.4, §3.2).

The mapping Recall→AMP is the single strongest argument that the spec is
buildable; see ADOPTION.md §2.

---

## 3. Decision log

| Decision | Why | Rejected alternative |
|----------|-----|----------------------|
| **MCP profile as primary binding** | adoptable today, zero host changes; rides the won transport | new JSON-RPC wire (slower adoption, competes with MCP) |
| **6 ops, 1 record** | MCP's small-surface lesson; ~100-line client | rich op set per kind (brittle, hard to ratify) |
| **Bi-temporal + supersede-never-delete** | only credible staleness/contradiction answer (Zep) | overwrite-on-change (the confident-wrong failure) |
| **Lifecycle as hints, not norms** | decay/promotion is where engines compete; encoding them freezes the wire | standardize decay curves/promotion (over-spec risk #2) |
| **Provenance + consent in-record** | trust & privacy are the unmet needs; must travel with the data | app-layer policy (non-portable, the current gap) |
| **Operator-signed (not vendor)** | the ownership moat; portability requires user-held keys | vendor-signed (recreates lock-in) |
| **Conformance L0–L3** | adopt incrementally; a repo ships L0 files day one | all-or-nothing (kills adoption) |
| **Reuse PAM/MIF/PROV/DID vocab** | don't fragment a converged community; faster ratification | a fresh vocabulary (NIH, slower trust) |
| **Injection-resistant rehydration MANDATORY** | memory is attacker input; advice gets ignored | leave to implementers (security theater) |
| **Engine-agnostic retrieval (signals, not algorithm)** | lets vector/graph/hybrid compete; future-proof | mandate hybrid search (locks the algorithm) |

---

## 4. Hard problems & where AMP puts them

| Problem | AMP's placement |
|---------|-----------------|
| Extraction / salience | **Engine-side.** AMP carries the result + provenance, not the extractor. |
| Contradiction / staleness | **In spec:** bi-temporal + `supersedes` + `contradicts` relation (§2.3, §2.5). |
| Decay / forgetting | **Hint** (`lifecycle.decay`) + `forget` op; curves engine-side. |
| Scoping | **In spec:** composite scope + visibility (§2.2). |
| Privacy / PII / consent | **In spec:** `consent` block, enforced at boundaries (§2.7). The differentiator. |
| Portability / ownership | **In spec:** DID owner + signatures + export binding (§5.1, §4.3). |
| Retrieval | **Interface in spec, algorithm engine-side** (§3.2). |
| Provenance / trust | **In spec:** W3C PROV + content-addressing + operator sig (§2.6, §2.8). |
| Prompt-injection via memory | **In spec, mandatory:** rehydration pipeline (§5.3). |

The pattern: **structure, provenance, access, and trust are standardized;
intelligence (extraction, ranking, decay, consolidation) stays competitive.**

---

## 5. Risks (and mitigations baked into the design)

1. **Adoption chicken-and-egg / fragmentation.** PAM and MIF already split the
   would-be community; incumbents have no incentive to make memory portable.
   *Mitigation:* L0 file binding + MCP profile mean AMP works with **one** vendor
   on day one (via Recall), and adapters wrap existing stores rather than
   replacing them (ADOPTION §3).
2. **Over-specification.** Encoding decay/salience/ranking into the wire makes it
   brittle and slow to ratify. *Mitigation:* those are explicit non-goals; only
   structure/provenance/access are normative (Decision log row 4).
3. **Governance / trust capture.** A single-vendor "open" spec gets distrusted; an
   ungoverned one forks. *Mitigation:* neutral steward + permissive license +
   reference SDKs from day one — MCP's exact playbook (ADOPTION §5).
