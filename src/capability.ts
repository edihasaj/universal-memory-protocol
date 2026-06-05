/**
 * Capability-scoped access tokens (SPEC §5.2).
 *
 * Sharing (`visibility: shared`) is granted by a token scoping verbs × scope ×
 * time, signed by the OWNER's DID - least-privilege multi-agent sharing with no
 * central auth server. Verbs: read | write | derive | export.
 *
 * Wire form: "umpcap.<base64url(claims)>.<ed25519:base64url(sig)>"
 */

import { blake3 } from "@noble/hashes/blake3";
import { ed25519 } from "@noble/curves/ed25519";
import { base64urlnopad } from "@scure/base";
import { canonicalize } from "./canonical.ts";
import { publicKeyFromDidKey, type KeyPair } from "./integrity.ts";
import type { MemoryScope } from "./types.ts";

export type CapabilityVerb = "read" | "write" | "derive" | "export";

export interface CapabilityClaims {
  v: "ump-cap/0.1";
  /** Issuer = owner DID (the signer). */
  iss: string;
  /** Optional audience DID this token is minted for. */
  aud?: string;
  verbs: CapabilityVerb[];
  /** Scope this grant applies to (subset match against record scope). */
  scope: Partial<Pick<MemoryScope, "owner" | "project" | "agent" | "visibility">>;
  /** Not-before / expiry (ISO 8601). */
  nbf?: string;
  exp: string;
  /** Unique token id (for revocation lists). */
  jti: string;
}

const PREFIX = "umpcap";

export function mintCapability(
  key: KeyPair,
  grant: {
    verbs: CapabilityVerb[];
    scope: CapabilityClaims["scope"];
    exp: string;
    aud?: string;
    nbf?: string;
    jti: string;
  },
): string {
  const claims: CapabilityClaims = {
    v: "ump-cap/0.1",
    iss: key.did,
    aud: grant.aud,
    verbs: grant.verbs,
    scope: grant.scope,
    nbf: grant.nbf,
    exp: grant.exp,
    jti: grant.jti,
  };
  const payload = base64urlnopad.encode(utf8(canonicalize(claims)));
  const digest = blake3(utf8(payload));
  const sig = base64urlnopad.encode(ed25519.sign(digest, key.privateKey));
  return `${PREFIX}.${payload}.ed25519:${sig}`;
}

export interface VerifyResult {
  valid: boolean;
  claims?: CapabilityClaims;
  reason?: string;
}

export function verifyCapability(token: string, now: Date = new Date()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return { valid: false, reason: "malformed" };
  }
  const [, payload, sigPart] = parts;
  const sm = /^ed25519:(.+)$/.exec(sigPart!);
  if (!sm) return { valid: false, reason: "bad_sig_format" };

  let claims: CapabilityClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64urlnopad.decode(payload!)));
  } catch {
    return { valid: false, reason: "bad_payload" };
  }
  try {
    const digest = blake3(utf8(payload!));
    const ok = ed25519.verify(
      base64urlnopad.decode(sm[1]!),
      digest,
      publicKeyFromDidKey(claims.iss),
    );
    if (!ok) return { valid: false, reason: "signature_invalid" };
  } catch {
    return { valid: false, reason: "signature_invalid" };
  }

  const t = now.getTime();
  if (claims.nbf && Date.parse(claims.nbf) > t) return { valid: false, reason: "not_yet_valid", claims };
  if (Date.parse(claims.exp) < t) return { valid: false, reason: "expired", claims };
  return { valid: true, claims };
}

/** Is this verb allowed against this scope by the (already-verified) claims? */
export function allows(
  claims: CapabilityClaims,
  verb: CapabilityVerb,
  scope: Partial<MemoryScope>,
): boolean {
  if (!claims.verbs.includes(verb)) return false;
  const s = claims.scope;
  if (s.owner && s.owner !== scope.owner) return false;
  if (s.project && s.project !== scope.project) return false;
  if (s.agent && s.agent !== scope.agent) return false;
  if (s.visibility && s.visibility !== scope.visibility) return false;
  return true;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
