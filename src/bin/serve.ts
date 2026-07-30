#!/usr/bin/env node
/**
 * Reference UMP server entrypoint.
 *   node --experimental-strip-types src/bin/serve.ts            # MCP over stdio
 *   UMP_HTTP=4000 node --experimental-strip-types src/bin/serve.ts  # + HTTP binding
 *
 * Uses an in-memory store + a fresh signing key. A real deployment persists the
 * store and loads the operator key from secure storage.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { UmpServer } from "../server.ts";
import { InMemoryStore } from "../store.ts";
import { generateKeyPair } from "../integrity.ts";
import { createMcpServer } from "../bindings/mcp.ts";
import { createHttpServer } from "../bindings/http.ts";

const key = generateKeyPair();
const ump = new UmpServer({
  name: "ump-ref",
  version: "1.0.1",
  conformance: "L2",
  store: new InMemoryStore(),
  key,
});

const httpPort = process.env.UMP_HTTP ? Number(process.env.UMP_HTTP) : undefined;
if (httpPort) {
  createHttpServer(ump).listen(httpPort, () => {
    process.stderr.write(`[ump] HTTP binding on :${httpPort} (owner ${key.did})\n`);
  });
}

const mcp = createMcpServer(ump);
await mcp.connect(new StdioServerTransport());
process.stderr.write(`[ump] MCP binding on stdio (owner ${key.did})\n`);
