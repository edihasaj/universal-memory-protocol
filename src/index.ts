/** Universal Memory Protocol - reference SDK (UMP 1.0). */

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
export { randomId, contentId, isUmpId, isAmpId } from "./id.ts";
export { InMemoryStore, type MemoryStore } from "./store.ts";
export { MirrorStore } from "./stores/mirror.ts";
export { JsonFileStore } from "./stores/file.ts";
export { MarkdownDirectoryStore } from "./stores/markdown.ts";
export { PostgresStore, type PostgresClient } from "./stores/postgres.ts";
export {
  SqliteStore,
  type SqliteDatabase,
  type SqliteStatement,
} from "./stores/sqlite.ts";
export { RedisStore, type RedisClient } from "./stores/redis.ts";
export {
  VectorStore,
  QdrantStore,
  PineconeStore,
  WeaviateStore,
  type VectorMemoryClient,
} from "./stores/vector.ts";
export {
  importMemorySource,
  importMemorySources,
  parseMarkdownMemory,
  type ImportedMemoryDraft,
  type ImportOptions,
  type ImportSource,
  type ImportSourceKind,
} from "./importers/filesystem.ts";
export {
  UmpServer,
  type UmpServerOptions,
  type ChangeEvent,
  type ChangeListener,
} from "./server.ts";
export {
  InMemoryAuditLog,
  auditHash,
  type AuditLog,
  type AuditLogOptions,
  type AuditEvent,
  type AuditEntry,
  type AuditOp,
  type AuditActor,
  type AuditQuery,
  type AuditVerification,
} from "./audit.ts";
export { JsonlAuditLog } from "./audit-file.ts";
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
