/** Agent Memory Protocol — reference SDK (AMP 0.1). */

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
export { randomId, contentId, isOmpId } from "./id.ts";
export { InMemoryStore, type MemoryStore } from "./store.ts";
export { AmpServer, type AmpServerOptions } from "./server.ts";
export { rehydrate, type RehydrateOptions } from "./rehydrate.ts";
export * as file from "./bindings/file.ts";
export { createMcpServer } from "./bindings/mcp.ts";
export {
  createHttpServer,
  createHttpHandler,
  type HttpBindingOptions,
} from "./bindings/http.ts";
