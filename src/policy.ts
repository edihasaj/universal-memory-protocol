import type { MemoryRecord, MemoryScope } from "./types.ts";

/**
 * Visibility/scope gate used before ranking or injection.
 *
 * Private/shared records require an explicit owner match. Public records can be
 * discovered without owner context, but still honor any supplied scope filters.
 */
export function recordVisibleForScope(
  record: MemoryRecord,
  requested?: Partial<MemoryScope>,
): boolean {
  const scope = requested ?? {};

  if (record.scope.visibility !== "public") {
    if (!scope.owner || scope.owner !== record.scope.owner) return false;
  }

  for (const key of ["owner", "user", "project", "agent", "session", "visibility"] as const) {
    const wanted = scope[key];
    if (wanted !== undefined && record.scope[key] !== wanted) return false;
  }

  return true;
}
