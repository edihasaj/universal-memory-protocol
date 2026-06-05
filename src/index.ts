/** Universal Memory Protocol - reference SDK (UMP 0.1). */

export * from "./types.ts";
export { canonicalize } from "./canonical.ts";
export {
  generateKeyPair,
  didKeyFromPublicKey,
  publicKeyFromDidKey,
  contentHash,
  sign,
  verify,
  type KeyPair,
} from "./integrity.ts";
export { randomId, contentId, isAmpId } from "./id.ts";
export { InMemoryStore, type MemoryStore } from "./store.ts";
export {
  UmpServer,
  type UmpServerOptions,
  type ChangeEvent,
  type ChangeListener,
} from "./server.ts";
export { rehydrate, type RehydrateOptions } from "./rehydrate.ts";
export { validateDraft, isValidDraft } from "./validate.ts";
export {
  recordForScope,
  recordVisibleForScope,
  redactRecord,
  retentionExpired,
} from "./policy.ts";
export {
  mintCapability,
  verifyCapability,
  allows,
  type CapabilityClaims,
  type CapabilityVerb,
} from "./capability.ts";
export { buildWellKnown, type WellKnownManifest } from "./wellknown.ts";
export * as file from "./bindings/file.ts";
export { createMcpServer } from "./bindings/mcp.ts";
export {
  createHttpServer,
  createHttpHandler,
  type HttpBindingOptions,
} from "./bindings/http.ts";
