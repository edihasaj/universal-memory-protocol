/**
 * Strict RFC 3339 timestamp parsing for protocol inputs, at millisecond
 * precision. Sub-millisecond fractions are rejected rather than rounded.
 *
 * `Date.parse` accepts several non-RFC formats and silently normalizes invalid
 * calendar dates. UMP timestamps are protocol data, so reject those forms at
 * the boundary instead of changing their meaning.
 */

import type { MemoryTime } from "./types.ts";

const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

/** Returns the epoch milliseconds for a strict RFC 3339 instant, if valid. */
export function rfc3339Timestamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = RFC3339.exec(value);
  if (!match) return undefined;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, zone] = match;
  if (
    yearText === undefined || monthText === undefined || dayText === undefined ||
    hourText === undefined || minuteText === undefined || secondText === undefined ||
    zone === undefined
  ) {
    return undefined;
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth(year, month) ||
    hour > 23 || minute > 59 || second > 59
  ) {
    return undefined;
  }

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return undefined;
    offsetMinutes = zoneHour * 60 + zoneMinute;
    if (zone.startsWith("-")) offsetMinutes *= -1;
  }

  // Avoid Date.UTC's special treatment of years 0 through 99.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, Number((fraction ?? "").padEnd(3, "0")));
  const localTimestamp = date.getTime();
  if (Number.isNaN(localTimestamp)) return undefined;
  return localTimestamp - offsetMinutes * 60_000;
}

export function isRfc3339(value: unknown): value is string {
  return rfc3339Timestamp(value) !== undefined;
}

/**
 * Close a prior validity window at a successor's start without extending an
 * already-bounded prior window. A later successor leaves a legitimate gap.
 *
 * UMP 1.0 intervals are inclusive: equal endpoints remain valid on both
 * records, intentionally representing a shared boundary.
 */
export function closePriorAtSuccessor(
  prior: MemoryTime,
  successor: MemoryTime,
): { time?: MemoryTime; problems: string[] } {
  const priorStart = rfc3339Timestamp(prior.valid_from ?? prior.created);
  const successorStart = rfc3339Timestamp(successor.valid_from);
  const priorEnd = prior.valid_to === null || prior.valid_to === undefined
    ? undefined
    : rfc3339Timestamp(prior.valid_to);
  if (priorStart === undefined || successorStart === undefined || priorEnd === undefined && prior.valid_to !== null && prior.valid_to !== undefined) {
    return { problems: ["revision requires valid RFC 3339 validity timestamps"] };
  }

  const validTo = priorEnd === undefined || successorStart < priorEnd
    ? successor.valid_from
    : prior.valid_to;
  const closedEnd = rfc3339Timestamp(validTo);
  if (closedEnd === undefined || closedEnd < priorStart) {
    return {
      problems: ["successor valid_from would close the prior before its valid_from"],
    };
  }
  return { time: { ...prior, valid_to: validTo }, problems: [] };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
