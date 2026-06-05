# Distribution checklist - where to list UMP

The highest-leverage channel is the MCP ecosystem: be the obvious "memory" server
people find when browsing. Submit `ump-memory` everywhere an MCP server is listed.

## MCP registries / directories
- [ ] Official MCP registry (modelcontextprotocol registry)
- [ ] `awesome-mcp-servers` (punkpeye) - PR adding ump-memory under "Memory"
- [ ] `awesome-mcp-servers` (wong2) - PR
- [ ] Smithery (smithery.ai) - publish server
- [ ] Glama (glama.ai/mcp/servers) - submit
- [ ] mcp.so - submit
- [ ] PulseMCP - submit
- [ ] mcpservers.org - submit

**Listing copy (short):**
> ump-memory - Portable, signed, persistent memory for any MCP host (Universal
> Memory Protocol). `ump.remember` / `ump.recall`; memory survives tool switches
> as an inspectable `.ump.json` file you own.

## Package registries
- [ ] npm: publish `@ump/core` (bins: ump-memory, ump-serve, ump-conformance)
- [ ] JSR (optional, ESM-native)

## Agent-framework ecosystems (adapters = new audiences)
- [ ] Cursor / Cline / Continue - memory integration docs + example config
- [ ] LangGraph / LangMem - a UMP store adapter
- [ ] Letta, mem0, Zep - "implements UMP" adapter + cross-link
- [ ] OpenAI Agents SDK / Assistants - HTTP-binding connector example

## Launch surfaces
- [ ] Show HN (see SHOW_HN.md)
- [ ] X thread (see X_THREAD.md)
- [ ] r/LocalLLaMA, r/ClaudeAI, r/MachineLearning (problem-first framing)
- [ ] dev.to / personal blog longform
- [ ] Hacker News / Lobsters
- [ ] Submit to the MCP community discussion as the "memory layer" proposal

## Standards venues (after some traction)
- [ ] MCP GitHub discussions / SEP process - frame memory as the missing layer
      (complementary, not competing)
- [ ] A2A (Linux Foundation) community - the third-layer positioning
- [ ] Reach DevRel/PM contacts publicly (X/GitHub) with the working demo, not cold
      email

## Credibility prerequisites (do before heavy outreach)
- [ ] Repos public
- [ ] Docs site or repo URL ready for launch
- [ ] >=2 independent implementations (reference + Recall + one framework adapter)
- [ ] GOVERNANCE.md visible (neutral-stewardship intent)
- [ ] Demo GIF in the README
