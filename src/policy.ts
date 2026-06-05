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

/** Apply record-level redaction when emitting across an export/share boundary. */
export function redactRecord(record: MemoryRecord): MemoryRecord {
  const paths = record.consent?.redact;
  if (!paths || paths.length === 0) return record;
  const clone = structuredClone(record) as MemoryRecord & Record<string, unknown>;
  for (const path of paths) deletePath(clone, path.split("."));
  return clone;
}

export function recordForScope(
  record: MemoryRecord,
  requested?: Partial<MemoryScope>,
): MemoryRecord {
  if (!record.consent?.redact?.length) return record;
  if (requested?.owner && requested.owner === record.scope.owner) return record;
  return redactRecord(record);
}

export function retentionExpired(record: MemoryRecord, now: Date): boolean {
  const retention = record.consent?.retention;
  if (!retention) return false;
  const created = Date.parse(record.time.created);
  const duration = parseIsoDurationMs(retention);
  if (Number.isNaN(created) || duration === undefined) return false;
  return created + duration <= now.getTime();
}

function parseIsoDurationMs(duration: string): number | undefined {
  const m =
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(duration);
  if (!m) return undefined;
  const [, years, months, weeks, days, hours, minutes, seconds] = m;
  const day = 86_400_000;
  return (
    Number(years ?? 0) * 365 * day +
    Number(months ?? 0) * 30 * day +
    Number(weeks ?? 0) * 7 * day +
    Number(days ?? 0) * day +
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Number(seconds ?? 0) * 1000
  );
}

function deletePath(obj: Record<string, unknown>, segs: string[]): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const next = cur[segs[i]!];
    if (next == null || typeof next !== "object") return;
    cur = next as Record<string, unknown>;
  }
  delete cur[segs[segs.length - 1]!];
}
