/**
 * Conformance runner (SPEC §7). Exercises an UMP HTTP endpoint and reports the
 * highest level it satisfies (L0-L3). Used by the CLI (`src/bin/conformance.ts`)
 * and by tests against the in-process HTTP binding.
 */

import { verify } from "./integrity.ts";
import type { ConformanceLevel, MemoryRecord } from "./types.ts";

export interface Check {
  id: string;
  level: ConformanceLevel;
  ok: boolean;
  detail: string;
}

export interface Report {
  level: ConformanceLevel | "none";
  badge: string;
  checks: Check[];
}

export interface RunOptions {
  /** Bearer capability token, if the endpoint enforces §5.2. */
  token?: string;
  /** Owner DID to scope test records (defaults to a throwaway string). */
  owner?: string;
}

export async function runConformance(baseUrl: string, opts: RunOptions = {}): Promise<Report> {
  const base = baseUrl.replace(/\/$/, "");
  const owner = opts.owner ?? "did:key:zConformanceProbe";
  const checks: Check[] = [];
  const add = (id: string, level: ConformanceLevel, ok: boolean, detail = "") =>
    checks.push({ id, level, ok, detail });

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { status: res.status, json };
  };

  // ── L1: capabilities, remember, get, recall ──
  let createdId = "";
  let createdRecord: MemoryRecord | undefined;
  try {
    const caps = await call("GET", "/ump/capabilities");
    add("L1.capabilities", "L1",
      caps.status === 200 && caps.json?.ump && Array.isArray(caps.json?.kinds) && caps.json.kinds.length === 5,
      `status ${caps.status}, kinds ${caps.json?.kinds?.length}`);

    const rem = await call("POST", "/ump/remember", {
      kind: "procedural",
      body: { text: "conformance: run the gate before handoff" },
      scope: { owner, project: "ump/conformance", visibility: "private" },
      provenance: { actor: owner, actor_kind: "user", method: "user_correction" },
    });
    createdId = rem.json?.id ?? "";
    add("L1.remember", "L1", rem.status === 200 && !!createdId && rem.json?.result === "created",
      `status ${rem.status}, result ${rem.json?.result}`);

    const got = await call("GET", `/ump/memory/${encodeURIComponent(createdId)}`);
    createdRecord = got.json?.record;
    add("L1.get", "L1", got.status === 200 && !!createdRecord?.body?.text, `status ${got.status}`);

    const rec = await call("POST", "/ump/recall", {
      query: "gate handoff", scope: { owner, project: "ump/conformance" },
    });
    add("L1.recall", "L1",
      rec.status === 200 && Array.isArray(rec.json?.results) &&
      rec.json.results.some((r: any) => r.record?.id === createdId) &&
      typeof rec.json.results[0]?.signals === "object",
      `status ${rec.status}, hits ${rec.json?.results?.length}`);
  } catch (e) {
    add("L1.reachable", "L1", false, `endpoint error: ${String(e)}`);
  }

  // ── L2: revise (bi-temporal), forget, validation ──
  if (createdId) {
    try {
      const rev = await call("POST", "/ump/revise", {
        id: createdId, patch: { body: { text: "conformance: use the new gate" } },
      });
      add("L2.revise", "L2",
        rev.status === 200 && Array.isArray(rev.json?.supersedes) && rev.json.supersedes.includes(createdId),
        `status ${rev.status}`);

      const prior = await call("GET", `/ump/memory/${encodeURIComponent(createdId)}`);
      add("L2.bitemporal", "L2",
        prior.json?.record?.time?.valid_to != null &&
        Array.isArray(prior.json?.record?.superseded_by) && prior.json.record.superseded_by.length > 0,
        `valid_to ${prior.json?.record?.time?.valid_to}`);

      const tmp = await call("POST", "/ump/remember", {
        kind: "working", body: { text: "conformance throwaway note" },
        scope: { owner, project: "ump/conformance", visibility: "private" },
        provenance: { actor: owner, actor_kind: "user", method: "user_correction" },
      });
      const f = await call("POST", "/ump/forget", { id: tmp.json?.id, reason: "conformance" });
      add("L2.forget", "L2",
        f.status === 200 && (f.json?.result === "tombstoned" || f.json?.result === "erased"),
        `result ${f.json?.result}`);

      const bad = await call("POST", "/ump/remember", { kind: "semantic", scope: { owner, visibility: "private" } });
      add("L2.validation", "L2", bad.status === 400 && bad.json?.error?.code === "invalid_record",
        `status ${bad.status}, code ${bad.json?.error?.code}`);
    } catch (e) {
      add("L2.reachable", "L2", false, `error: ${String(e)}`);
    }
  }

  // ── L3: signing, discovery ──
  try {
    const wk = await call("GET", "/.well-known/ump.json");
    add("L3.discovery", "L3", wk.status === 200 && !!wk.json?.ump && !!wk.json?.conformance,
      `status ${wk.status}`);
  } catch (e) {
    add("L3.discovery", "L3", false, `error: ${String(e)}`);
  }
  add("L3.signed", "L3",
    !!createdRecord?.integrity && verify(createdRecord),
    createdRecord?.integrity ? "signature verifies" : "no integrity block");

  // ── level = highest contiguous level fully satisfied ──
  const order: ConformanceLevel[] = ["L1", "L2", "L3"];
  let level: ConformanceLevel | "none" = "none";
  for (const lv of order) {
    const lvChecks = checks.filter((c) => c.level === lv);
    if (lvChecks.length === 0 || lvChecks.every((c) => c.ok)) level = lv;
    else break;
  }
  // L0 is implied if any record round-trips (it carries the portable format).
  if (level === "none" && createdRecord) level = "L1";

  return { level, badge: `UMP 0.1 / ${level}`, checks };
}
