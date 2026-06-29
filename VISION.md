# Vision

Universal Memory Protocol (UMP) is an open standard for **portable agent memory** —
the third interop layer beside MCP (tools) and A2A (coordination). It defines one
record format and six operations (recall, remember, get, revise, forget, feedback)
with bindings for MCP, HTTP, and plain files, so a fact taught to one agent is
available to the next. UMP is a **protocol, not a product**: no service to run, no
database to host — memory lives in a portable, signed file the user owns.

The standard should grow by sharpening the spec and reference implementation while
preserving portability, a small stable surface, and vendor-neutral interop.

## In Scope

- The protocol spec: the record format, the six operations, versioning, and
  conformance.
- Reference-implementation correctness across the bindings (MCP, HTTP, file).
- Interop and portability: any agent or store can read and extend the same memory.
- Docs, examples, and conformance tests that make the standard easy to adopt.

## Out of Scope

- Turning UMP into a hosted product, paid service, or database to sign up for.
- Vendor- or tool-specific features that don't generalize across agents.
- Scope expansion beyond memory interop (UMP is the memory layer, not an agent
  framework, tool protocol, or orchestration system).
- Large pivots or unrelated apps.

## Merge by Default

- Spec clarifications and doc fixes that don't change semantics.
- Reference-implementation bug fixes with a clear cause and bounded risk.
- New conformance tests and examples following existing patterns.
- Small DX/ergonomics improvements that keep the surface stable.

## Needs Sign-Off

- New operations, record-format changes, or anything that alters the protocol
  surface or wire format.
- New bindings or transports.
- Breaking changes to the spec or compatibility.
- Dependency, toolchain, or release changes.
- Anything that expands scope beyond memory interop.

## Roadmap

### Short-term

- Stabilize the v0.1 spec and reference implementation.
- Keep the output shape stable across operations (no format drift between calls).
- Conformance tests and clear, hype-free docs (remove vagueness; be specific).

### Long-term

- Broaden the binding ecosystem so more agents and stores speak UMP natively.
- Establish UMP as the memory interop layer alongside MCP and A2A.
- Strengthen portability and trust: signed, user-owned memory and safe
  multi-agent sharing.
