# Show HN draft

**Title:**
Show HN: UMP - portable memory for AI agents, works with any MCP host

**URL:** <project site or repo>

**Body:**

Every AI agent I use - Claude Code, Cursor, Codex, ChatGPT - learns my
preferences, my project's conventions, the gotchas... and then forgets all of it
the moment I switch tools. The knowledge is trapped in whichever product learned
it. There's no portable way to carry it across.

MCP standardized how agents call tools. A2A standardized agent-to-agent calls.
Nobody standardized **memory**. So I wrote UMP (Universal Memory Protocol): a
small, open standard for how agents read, write, and exchange memory.

It's deliberately not a new wire protocol - it rides MCP. You add one MCP server
and any host gets `ump.remember` / `ump.recall`:

    { "mcpServers": { "ump": { "command": "npx", "args": ["-y", "@ump/core", "ump-memory"] } } }

Memory persists as a portable, signed file (`~/.ump/memory.ump.json`). Point the
next tool at the same store and it keeps everything. That's the whole pitch:
write in Claude, recall in Cursor.

What's actually in the spec (the parts I think matter):

- A portable record: typed (semantic/episodic/procedural/working/identity),
  scoped, **bi-temporal** (a fact that changes is superseded, never overwritten),
  with provenance.
- **User-owned**: records are content-addressed and Ed25519-signed by *your*
  key (a DID), not the vendor's. You can verify and export them.
- **Injection-resistant rehydration** is mandatory in the spec - recalled memory
  is treated as untrusted input, not instructions.
- Three bindings (MCP / HTTP / file) and four conformance levels (L0-L3) so you
  can adopt a `.ump.json` export today or run the full signed runtime.

Working reference SDK (MIT), conformance suite that self-certifies L3, and an
adapter that serves it over an existing memory engine. Spec/docs are CC-BY-4.0;
code/package is MIT.

I'd love feedback on the record format and the trust model specifically. Repo:
https://github.com/<org>/universal-memory-protocol

**Comment prep (anticipated):**
- *"How is this different from mem0 / Letta / Zep?"* Those are great engines/
  products with proprietary verbs. UMP is the *protocol* between any host and any
  store - they can implement it as adapters (and keep competing on retrieval).
- *"Why not just files / Obsidian?"* File-only formats skip the hard parts:
  negotiation, signing/ownership, bi-temporal staleness, consent, injection
  safety, access control. UMP specifies those; the file binding is one of three.
- *"What if the project site moves?"* Spec + code are portable and signed; the
  site is just a pointer.
