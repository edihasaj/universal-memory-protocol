/**
 * Discovery manifest (SPEC §4.3): a repo/site publishes `/.well-known/amp.json`
 * pointing at its endpoint(s), conformance level, and any portable exports -
 * mirroring the AGENTS.md / llms.txt convention.
 */

import type { Capabilities } from "./types.ts";

export interface WellKnownManifest {
  amp: string;
  conformance: Capabilities["conformance"];
  bindings: Capabilities["bindings"];
  kinds: Capabilities["kinds"];
  retrieval_signals: string[];
  /** Live endpoint base, if any (HTTP binding). */
  endpoint?: string;
  /** Portable export files a client can fetch without a server. */
  exports?: Array<{ url: string; format: "amp.json" | "amp.md" | "ndjson" }>;
  /** Owner DID, if the publisher signs records. */
  owner?: string;
}

export function buildWellKnown(
  caps: Capabilities,
  opts: { endpoint?: string; exports?: WellKnownManifest["exports"]; owner?: string } = {},
): WellKnownManifest {
  return {
    amp: caps.amp,
    conformance: caps.conformance,
    bindings: caps.bindings,
    kinds: caps.kinds,
    retrieval_signals: caps.retrieval_signals,
    endpoint: opts.endpoint,
    exports: opts.exports,
    owner: opts.owner,
  };
}
