# Governance

UMP is intended to be a **neutral, vendor-independent open standard** - not a
single company's project. A standard that one party controls gets routed around;
this document states the intent and the path to neutral stewardship.

## Principles

- **Open by default.** Spec under CC-BY-4.0, code under Apache-2.0. All design
  discussion happens in public (GitHub issues/discussions).
- **Vendor-neutral.** No single implementation, model provider, or company is
  privileged by the spec. The reference SDK is one implementation among many.
- **Rough consensus + running code.** Changes land when there is agreement and at
  least one working implementation. Breaking changes need two.
- **Minimal core.** The wire surface stays small; intelligence (ranking, decay,
  extraction) stays in engines, not the spec.

## Current stage

UMP is at **live v0.1**, authored by [@edihasaj](https://github.com/edihasaj).
This is the bootstrap phase: one maintainer, fast iteration, public repo.

## Path to neutral stewardship

1. **Live v0.1 (now).** Single maintainer, public spec, reference implementation.
2. **Working group.** Recruit maintainers from independent implementers; decisions
   move to a documented proposal process (UMP Enhancement Proposals, "UEPs").
3. **Foundation track.** Once there are multiple production implementations across
   vendors, move the spec and trademark to a neutral home (e.g. a Linux Foundation
   /  OpenSSF-style working group, alongside where MCP and A2A are governed).

## Proposal process (interim)

- Open an issue describing the problem and the smallest change that fixes it.
- Substantive changes to the record format or the operations are **UEPs**: a
  short doc with motivation, spec delta, and migration notes.
- A UEP is accepted when there is rough consensus and >=2 independent
  implementations validate it. Until then it stays in proposal.

## Decision making

While in the v0.1 bootstrap stage the maintainer is the tie-breaker, but the bias is
toward deferring contentious calls until there is implementation evidence.
The goal is to make the maintainer's tie-break vote matter less over time, not
more.

Contact: edihasaj@gmail.com
