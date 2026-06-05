# 90-second demo script (the cross-vendor moment)

Goal: show one memory written in one tool, recalled in another, owned as a file.
Record it as a screen capture; export a GIF for the README and the launch posts.

## Setup (off camera)
- A clean `~/.ump` (or `UMP_DIR=/tmp/ump-demo`).
- Two MCP hosts configured with the same UMP server, e.g. Claude Code and Cursor:

  { "mcpServers": { "ump":
    { "command": "npx", "args": ["-y","@universalmemoryprotocol/core","ump-memory"] } } }

## Beat 1 - teach it (0:00-0:25)  [in Claude Code]
> "Remember: in this repo we use pnpm, never npm, and always run `pnpm gate`
>  before handoff."

Agent calls `ump.remember`. Show the confirmation. Cut to the file:

    cat ~/.ump/memory.ump.json | jq '.[0] | {kind, body, scope, integrity}'

Point out: typed `procedural`, signed (`integrity`), owned by your DID.

## Beat 2 - switch tools (0:25-0:50)  [in Cursor]
New tool, new session, zero shared app state - just the same UMP store.
> "What should I do before I hand off work in this repo?"

Agent calls `ump.recall` and answers with the pnpm gate rule. The knowledge
crossed vendors. That's the moment.

## Beat 3 - it's yours (0:50-1:20)
Show ownership + portability:

    # verify it is signed by your key, not a vendor's
    npx -y @universalmemoryprotocol/core ump-conformance http://localhost:4000   # if HTTP enabled
    # or just show the portable file is a plain, inspectable, signed record

> "It's a file you own. Copy the directory and you've migrated your agent's mind -
>  to any tool that speaks UMP."

## Closing card (1:20-1:30)
UMP - MCP = tools, A2A = coordination, memory needs its own portable layer.
