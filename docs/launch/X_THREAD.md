# X / Twitter launch thread draft

**1/**
Your AI agent learns your preferences, your stack, your gotchas - then forgets all
of it the second you switch from Claude to Cursor.

MCP standardized tools. A2A standardized agent-to-agent.
Nobody standardized memory.

So I built UMP: the Universal Memory Protocol. 🧵

**2/**
The pitch in one config block. Add one MCP server, any host gets portable memory:

{ "mcpServers": { "ump":
  { "command": "npx", "args": ["-y","@ump/core","ump-memory"] } } }

Now your agent has ump.remember / ump.recall. Memory lives in a portable signed
file. Switch tools, keep everything.

**3/**
UMP isn't a new wire protocol - it rides MCP. That's the whole adoption bet:
MCP = tools, A2A = coordination, UMP = memory. The third interop layer, on rails
that already won.

**4/**
What's in the record (the parts that matter):
- typed + scoped + bi-temporal (a fact that changes is *superseded, never
  overwritten* - the real fix for stale memory)
- provenance built in
- content-addressed + Ed25519-signed by YOUR key (a DID), not the vendor's

You own it. You can verify and export it.

**5/**
Security: recalled memory is attacker-controllable input. UMP *mandates*
injection-resistant rehydration - memories are framed as untrusted data, never
executed as instructions. Most "memory" tools don't spec this.

**6/**
Adopt incrementally. 4 conformance levels:
L0 a portable .ump.json file - today.
L3 the full signed, access-controlled runtime.
3 bindings: MCP, HTTP, file.

**7/**
It's real, not a slide deck:
- reference SDK (MIT)
- conformance suite that self-certifies L3
- an adapter that serves UMP over an existing memory engine

Protocol repo Apache-2.0. Package MIT. Docs CC-BY-4.0. Built to be vendor-neutral.

**8/**
If you build agents, agent frameworks, or memory tools: I want UMP to be the
boring, shared layer underneath all of it. Read the spec, poke holes in the
record format + trust model, build an adapter.

<project site>
github.com/<org>/universal-memory-protocol
