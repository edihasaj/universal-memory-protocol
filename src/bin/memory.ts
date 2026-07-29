#!/usr/bin/env node
/**
 * ump-memory - a persistent Universal Memory Protocol server you can plug into
 * any MCP host (Claude Code, Cursor, Codex, ...) in one line.
 *
 *   npx -y @universalmemoryprotocol/core ump-memory                  # MCP over stdio
 *   UMP_HTTP=4000 npx -y @universalmemoryprotocol/core ump-memory    # + HTTP binding
 *
 * Unlike the ephemeral reference (`ump-serve`), this persists memories to disk
 * (atomic UMP JSON export) and keeps a STABLE operator identity across restarts,
 * so records stay owned, signed, and verifiable. Config via env:
 *
 *   UMP_DIR   data directory            (default: ~/.ump)
 *   UMP_STORE json | markdown           (default: json)
 *   UMP_HTTP  also serve HTTP on a port (default: off; stdio only)
 *   UMP_AUDIT on | off                  (default: on; signed audit trail §9)
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  UmpServer,
  JsonFileStore,
  JsonlAuditLog,
  MarkdownDirectoryStore,
  createMcpServer,
  createHttpServer,
  generateKeyPair,
  type KeyPair,
} from "../index.ts";

const dir = process.env.UMP_DIR || join(homedir(), ".ump");
const storeKind = process.env.UMP_STORE || "json";
const auditOn = process.env.UMP_AUDIT !== "off";
mkdirSync(dir, { recursive: true });

const key = loadOrCreateKey(join(dir, "key.json"));
const store =
  storeKind === "markdown"
    ? await MarkdownDirectoryStore.open(join(dir, "memory.d"))
    : await JsonFileStore.open(join(dir, "memory.ump.json"));

// Signed, hash-chained audit trail (SPEC §9). Disable with UMP_AUDIT=off.
const audit = auditOn
  ? await JsonlAuditLog.open(join(dir, "audit.log.jsonl"), { key })
  : undefined;

const server = new UmpServer({
  name: "ump-memory",
  version: "1.0.0",
  conformance: "L2",
  store,
  key,
  audit,
});

const httpPort = process.env.UMP_HTTP ? Number(process.env.UMP_HTTP) : undefined;
if (httpPort) {
  createHttpServer(server, { wellKnown: { owner: key.did } }).listen(httpPort, () => {
    log(`HTTP binding on :${httpPort}`);
  });
}

await createMcpServer(server).connect(new StdioServerTransport());
log(`MCP binding on stdio`);
log(`data ${dir}  store ${storeKind}  audit ${audit ? "on" : "off"}  owner ${key.did}`);

/** Load the operator key seed from disk, or create and persist a new one. */
function loadOrCreateKey(path: string): KeyPair {
  if (existsSync(path)) {
    try {
      const { seed } = JSON.parse(readFileSync(path, "utf8"));
      return generateKeyPair(Uint8Array.from(Buffer.from(seed, "base64")));
    } catch {
      log(`warning: could not read ${path}, generating a new key`);
    }
  }
  const kp = generateKeyPair();
  writeFileSync(path, JSON.stringify({ seed: Buffer.from(kp.privateKey).toString("base64") }), {
    mode: 0o600,
  });
  try { chmodSync(path, 0o600); } catch { /* best effort */ }
  return kp;
}

function log(msg: string): void {
  process.stderr.write(`[ump-memory] ${msg}\n`);
}
