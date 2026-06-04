/**
 * Reference AMP server entrypoint.
 *   node --experimental-strip-types src/bin/serve.ts            # MCP over stdio
 *   AMP_HTTP=4000 node --experimental-strip-types src/bin/serve.ts  # + HTTP binding
 *
 * Uses an in-memory store + a fresh signing key. A real deployment persists the
 * store and loads the operator key from secure storage.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AmpServer } from "../server.ts";
import { InMemoryStore } from "../store.ts";
import { generateKeyPair } from "../integrity.ts";
import { createMcpServer } from "../bindings/mcp.ts";
import { createHttpServer } from "../bindings/http.ts";

const key = generateKeyPair();
const amp = new AmpServer({
  name: "amp-ref",
  version: "0.1.0",
  conformance: "L3",
  store: new InMemoryStore(),
  key,
});

const httpPort = process.env.AMP_HTTP ? Number(process.env.AMP_HTTP) : undefined;
if (httpPort) {
  createHttpServer(amp).listen(httpPort, () => {
    process.stderr.write(`[amp] HTTP binding on :${httpPort} (owner ${key.did})\n`);
  });
}

const mcp = createMcpServer(amp);
await mcp.connect(new StdioServerTransport());
process.stderr.write(`[amp] MCP binding on stdio (owner ${key.did})\n`);
