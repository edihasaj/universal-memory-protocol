import { describe, it, expect } from "vitest";
import type { AddressInfo } from "node:net";
import {
  UmpServer,
  InMemoryStore,
  generateKeyPair,
  mintCapability,
  verifyCapability,
  allows,
  validateDraft,
  createHttpServer,
  type CapabilityVerb,
} from "../src/index.ts";
import { runConformance } from "../src/conformance.ts";

const OWNER = generateKeyPair(new Uint8Array(32).fill(11));
const fixed = () => new Date("2026-06-04T10:00:00Z");

function server(opts: { sign?: boolean } = {}) {
  return new UmpServer({
    name: "ump-ref", version: "0.1.0", store: new InMemoryStore(),
    now: fixed, key: opts.sign ? OWNER : undefined,
  });
}

describe("record validation (SPEC §2)", () => {
  it("accepts a well-formed draft", () => {
    expect(validateDraft({
      kind: "semantic", body: { text: "x" },
      scope: { owner: OWNER.did, visibility: "private" },
    })).toEqual([]);
  });
  it("flags bad kind, missing body, bad confidence", () => {
    const errs = validateDraft({
      kind: "nope" as any, body: { text: "" } as any,
      scope: { owner: "", visibility: "weird" as any },
      lifecycle: { confidence: 9 },
    });
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });
  it("server rejects invalid remember", async () => {
    await expect(server().remember({ kind: "semantic", scope: { owner: OWNER.did, visibility: "private" } } as any))
      .rejects.toThrow(/invalid_record/);
  });
});

describe("capability tokens (SPEC §5.2)", () => {
  it("mints, verifies, and authorizes by verb + scope", () => {
    const tok = mintCapability(OWNER, {
      verbs: ["read"], scope: { project: "p1" },
      exp: "2999-01-01T00:00:00Z", jti: "t1",
    });
    const v = verifyCapability(tok, fixed());
    expect(v.valid).toBe(true);
    expect(allows(v.claims!, "read", { project: "p1" })).toBe(true);
    expect(allows(v.claims!, "write", { project: "p1" })).toBe(false); // verb not granted
    expect(allows(v.claims!, "read", { project: "p2" })).toBe(false);  // scope mismatch
  });
  it("rejects expired and tampered tokens", () => {
    const expired = mintCapability(OWNER, { verbs: ["read"], scope: {}, exp: "2000-01-01T00:00:00Z", jti: "e" });
    expect(verifyCapability(expired, fixed()).reason).toBe("expired");
    const good = mintCapability(OWNER, { verbs: ["read"], scope: {}, exp: "2999-01-01T00:00:00Z", jti: "g" });
    expect(verifyCapability(good.slice(0, -4) + "AAAA", fixed()).valid).toBe(false);
  });
});

describe("subscribe (SPEC §3.8)", () => {
  it("emits change events to scoped listeners", async () => {
    const s = server();
    const events: string[] = [];
    const unsub = s.subscribe((e) => events.push(`${e.type}:${e.record.body.text}`), { project: "watched" });
    await s.remember({ kind: "semantic", body: { text: "in" }, scope: { owner: OWNER.did, project: "watched", visibility: "private" }, provenance: { actor: OWNER.did, actor_kind: "user", method: "m" } });
    await s.remember({ kind: "semantic", body: { text: "out" }, scope: { owner: OWNER.did, project: "other", visibility: "private" }, provenance: { actor: OWNER.did, actor_kind: "user", method: "m" } });
    unsub();
    await s.remember({ kind: "semantic", body: { text: "after" }, scope: { owner: OWNER.did, project: "watched", visibility: "private" }, provenance: { actor: OWNER.did, actor_kind: "user", method: "m" } });
    expect(events).toEqual(["created:in"]);
  });
});

describe("HTTP capability enforcement", () => {
  it("401 without token, 200 with a valid grant", async () => {
    const s = server({ sign: true });
    const http = createHttpServer(s, { requireCapability: { now: fixed } });
    const base = await listen(http);
    try {
      const body = JSON.stringify({ query: "x", scope: { owner: OWNER.did } });
      const noTok = await fetch(`${base}/ump/recall`, { method: "POST", headers: { "content-type": "application/json" }, body });
      expect(noTok.status).toBe(401);

      const tok = mintCapability(OWNER, { verbs: ["read"], scope: { owner: OWNER.did }, exp: "2999-01-01T00:00:00Z", jti: "h" });
      const withTok = await fetch(`${base}/ump/recall`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body,
      });
      expect(withTok.status).toBe(200);
    } finally {
      http.close();
    }
  });

  it("authorizes id-based reads against the stored record scope", async () => {
    const s = server();
    const p1 = await s.remember({
      kind: "semantic",
      body: { text: "project one memory" },
      scope: { owner: OWNER.did, project: "p1", visibility: "private" },
      provenance: { actor: OWNER.did, actor_kind: "user", method: "m" },
    });
    const p2 = await s.remember({
      kind: "semantic",
      body: { text: "project two memory" },
      scope: { owner: OWNER.did, project: "p2", visibility: "private" },
      provenance: { actor: OWNER.did, actor_kind: "user", method: "m" },
    });
    const http = createHttpServer(s, { requireCapability: { now: fixed } });
    const base = await listen(http);
    try {
      const tok = mintCapability(OWNER, {
        verbs: ["read"],
        scope: { owner: OWNER.did, project: "p1" },
        exp: "2999-01-01T00:00:00Z",
        jti: "get-scope",
      });
      const headers = { authorization: `Bearer ${tok}` };
      const allowed = await fetch(`${base}/ump/memory/${encodeURIComponent(p1.id)}`, { headers });
      const denied = await fetch(`${base}/ump/memory/${encodeURIComponent(p2.id)}`, { headers });
      expect(allowed.status).toBe(200);
      expect(denied.status).toBe(403);
    } finally {
      http.close();
    }
  });
});

describe("conformance runner (SPEC §7)", () => {
  it("rates the reference HTTP server as L3", async () => {
    const s = server({ sign: true });
    const http = createHttpServer(s, {
      requireCapability: { now: fixed },
      wellKnown: { owner: OWNER.did },
    });
    const base = await listen(http);
    try {
      const token = mintCapability(OWNER, {
        verbs: ["read", "write", "derive"] satisfies CapabilityVerb[],
        scope: {},
        exp: "2999-01-01T00:00:00Z",
        jti: "conformance",
      });
      const report = await runConformance(base, { owner: OWNER.did, token });
      const failed = report.checks.filter((c) => !c.ok);
      expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
      expect(report.level).toBe("L3");
      expect(report.badge).toBe("UMP 0.1 / L3");
    } finally {
      http.close();
    }
  });

  it("does not rate an unsigned unauthenticated endpoint as L3", async () => {
    const s = server();
    const http = createHttpServer(s);
    const base = await listen(http);
    try {
      const report = await runConformance(base, { owner: OWNER.did });
      expect(report.level).toBe("L2");
      expect(report.checks.find((c) => c.id === "L3.signed")?.ok).toBe(false);
      expect(report.checks.find((c) => c.id === "L3.capability_tokens")?.ok).toBe(false);
    } finally {
      http.close();
    }
  });
});

function listen(http: ReturnType<typeof createHttpServer>): Promise<string> {
  return new Promise((resolve) => {
    http.listen(0, () => {
      const { port } = http.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}
