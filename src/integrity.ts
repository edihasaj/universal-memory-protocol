/**
 * Integrity: BLAKE3 content hashing + Ed25519 signing over canonical records,
 * with did:key identity for the operator (SPEC §2.8, §5.1, §6.1).
 *
 * The operator - not the model vendor - holds the key. This is the ownership
 * moat: a record is tamper-evident and provably the user's, wherever it lives.
 */

import { blake3 } from "@noble/hashes/blake3";
import { ed25519 } from "@noble/curves/ed25519";
import { base32nopad, base58, base64 } from "@scure/base";
import { canonicalize } from "./canonical.ts";
import type { Integrity, MemoryRecord } from "./types.ts";

// Multicodec prefix for Ed25519 public keys (0xed01), per did:key spec.
const ED25519_MULTICODEC = Uint8Array.from([0xed, 0x01]);

export interface KeyPair {
  /** did:key string, e.g. "did:key:z6Mk…" */
  did: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateKeyPair(seed?: Uint8Array): KeyPair {
  const privateKey = seed ?? ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { did: didKeyFromPublicKey(publicKey), privateKey, publicKey };
}

/** Encode an Ed25519 public key as a did:key (multibase base58btc, "z" prefix). */
export function didKeyFromPublicKey(publicKey: Uint8Array): string {
  const prefixed = new Uint8Array(ED25519_MULTICODEC.length + publicKey.length);
  prefixed.set(ED25519_MULTICODEC, 0);
  prefixed.set(publicKey, ED25519_MULTICODEC.length);
  return "did:key:z" + base58.encode(prefixed);
}

/** Recover the raw Ed25519 public key from a did:key string. */
export function publicKeyFromDidKey(did: string): Uint8Array {
  const m = /^did:key:z([1-9A-HJ-NP-Za-km-z]+)$/.exec(did);
  if (!m) throw new Error(`integrity: not a did:key: ${did}`);
  const decoded = base58.decode(m[1]!);
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("integrity: unsupported did:key codec (need ed25519)");
  }
  return decoded.slice(2);
}

/** BLAKE3 hash of the canonical record (excluding `integrity`). */
export function contentHash(record: MemoryRecord): string {
  const { integrity: _omit, ...rest } = record;
  const bytes = new TextEncoder().encode(canonicalize(rest));
  return "blake3:" + base32nopad.encode(blake3(bytes)).toLowerCase();
}

/** Sign a record: compute content hash, sign it, attach `integrity`. */
export function sign(record: MemoryRecord, key: KeyPair): MemoryRecord {
  const hash = contentHash(record);
  const digest = blake3(new TextEncoder().encode(hash));
  const sig = ed25519.sign(digest, key.privateKey);
  const integrity: Integrity = {
    content_hash: hash,
    signature: "ed25519:" + base64.encode(sig),
    signer: key.did,
  };
  return { ...record, integrity };
}

/** Verify a signed record: hash matches body AND signature matches signer DID. */
export function verify(record: MemoryRecord): boolean {
  const { integrity } = record;
  if (!integrity) return false;
  if (contentHash(record) !== integrity.content_hash) return false;

  const m = /^ed25519:(.+)$/.exec(integrity.signature);
  if (!m) return false;
  try {
    const sig = base64.decode(m[1]!);
    const pub = publicKeyFromDidKey(integrity.signer);
    const digest = blake3(new TextEncoder().encode(integrity.content_hash));
    return ed25519.verify(sig, digest, pub);
  } catch {
    return false;
  }
}
