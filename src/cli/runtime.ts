/** Shared runtime helpers for the ump CLI: operator identity + store opening. */

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import {
  JsonFileStore,
  MarkdownDirectoryStore,
  generateKeyPair,
  type KeyPair,
  type MemoryStore,
} from "../index.ts";

export function resolveDir(dir?: string): string {
  const d = dir || process.env.UMP_DIR || join(homedir(), ".ump");
  mkdirSync(d, { recursive: true });
  return d;
}

/** Load the operator key seed from disk, or create and persist a stable one. */
export function loadOrCreateKey(dir: string): KeyPair {
  const path = join(dir, "key.json");
  if (existsSync(path)) {
    try {
      const { seed } = JSON.parse(readFileSync(path, "utf8"));
      return generateKeyPair(Uint8Array.from(Buffer.from(seed, "base64")));
    } catch {
      /* fall through and regenerate */
    }
  }
  const kp = generateKeyPair();
  writeFileSync(path, JSON.stringify({ seed: Buffer.from(kp.privateKey).toString("base64") }), {
    mode: 0o600,
  });
  try { chmodSync(path, 0o600); } catch { /* best effort */ }
  return kp;
}

export type StoreKind = "json" | "markdown";

export async function openStore(
  kind: StoreKind,
  dir: string,
): Promise<{ store: MemoryStore; location: string }> {
  if (kind === "markdown") {
    const location = join(dir, "memory.d");
    return { store: await MarkdownDirectoryStore.open(location), location };
  }
  const location = join(dir, "memory.ump.json");
  return { store: await JsonFileStore.open(location), location };
}
