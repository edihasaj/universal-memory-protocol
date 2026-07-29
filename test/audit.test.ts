import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import {
  UmpServer,
  InMemoryStore,
  InMemoryAuditLog,
  JsonlAuditLog,
  createHttpServer,
  generateKeyPair,
  type AuditLog,
} from "../src/index.ts";

const OWNER = generateKeyPair(new Uint8Array(32).fill(11));
const AGENT = "did:key:zAgentActor";
const fixed = () => new Date("2026-06-04T10:00:00Z");

function server(audit?: AuditLog, opts: { sign?: boolean } = {}) {
  return new UmpServer({
    name: "ump-ref",
    version: "1.0.0",
    store: new InMemoryStore(),
    now: fixed,
    key: opts.sign ? OWNER : undefined,
    audit,
  });
}

function draft(text: string, extra: Record<string, unknown> = {}) {
  return {
    kind: "procedural" as const,
    body: { text },
    scope: { owner: OWNER.did, project: "app", visibility: "private" as const },
    provenance: { actor: OWNER.did, actor_kind: "user" as const, method: "user_correction" },
    ...extra,
  };
}

describe("audit trail (SPEC §9)", () => {
  it("is off by default: no capability, querying throws unsupported", async () => {
    const s = server();
    expect(s.capabilities().audit).toBe(false);
    await expect(s.audit()).rejects.toThrow(/unsupported/);
    await expect(s.verifyAudit()).rejects.toThrow(/unsupported/);
  });

  it("advertises audit in capabilities when enabled", () => {
    expect(server(new InMemoryAuditLog()).capabilities().audit).toBe(true);
  });

  it("records every operation - reads included - as a verifiable chain", async () => {
    const log = new InMemoryAuditLog({ now: fixed });
    const s = server(log);

    const { id } = await s.remember(draft("use pnpm, never npm"));
    await s.recall({ query: "pnpm", scope: { owner: OWNER.did }, actor: { did: AGENT, kind: "agent" } });
    await s.get(id, undefined, { did: AGENT, kind: "agent" });
    await s.revise({ id, patch: { body: { text: "use bun, not pnpm" } }, actor: { did: AGENT, kind: "agent" } });

    const events = await s.audit();
    expect(events.map((e) => e.op)).toEqual(["remember", "recall", "get", "revise"]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);

    // The read event captures which records were returned.
    const recall = events.find((e) => e.op === "recall")!;
    expect(recall.targets).toContain(id);
    expect(recall.meta?.count).toBe(1);

    const verdict = await s.verifyAudit();
    expect(verdict).toEqual({ ok: true, count: 4 });
  });

  it("attributes who performed each op", async () => {
    const log = new InMemoryAuditLog({ now: fixed });
    const s = server(log);
    const { id } = await s.remember(draft("x"));
    await s.forget({ id, reason: "obsolete", actor: { did: AGENT, kind: "agent" } });

    // remember is attributed to the record author; forget to the caller.
    const [remember, forget] = await s.audit();
    expect(remember!.actor?.did).toBe(OWNER.did);
    expect(forget!.actor?.did).toBe(AGENT);
    expect(forget!.meta?.reason).toBe("obsolete");
  });

  it("stamps the reviser into the successor's provenance (attribution fix)", async () => {
    const s = server(new InMemoryAuditLog({ now: fixed }));
    const { id } = await s.remember(draft("original"));
    const { id: newId } = await s.revise({
      id,
      patch: { body: { text: "revised" } },
      actor: { did: AGENT, kind: "agent" },
    });
    const successor = await s.peek(newId);
    expect(successor.provenance?.actor).toBe(AGENT);
    expect(successor.provenance?.method).toBe("revise");
    // Prior remains queryable, still authored by the original actor.
    const prior = await s.peek(id);
    expect(prior.provenance?.actor).toBe(OWNER.did);
  });

  it("preserves prior provenance when no actor is supplied (backward compatible)", async () => {
    const s = server();
    const { id } = await s.remember(draft("original"));
    const { id: newId } = await s.revise({ id, patch: { body: { text: "revised" } } });
    const successor = await s.peek(newId);
    expect(successor.provenance?.actor).toBe(OWNER.did);
  });

  it("peek does not log, so internal loads don't pollute the trail", async () => {
    const log = new InMemoryAuditLog({ now: fixed });
    const s = server(log);
    const { id } = await s.remember(draft("x"));
    await s.peek(id);
    await s.peek(id);
    // remember produced one event; peeks produced none.
    const events = await s.audit();
    expect(events).toHaveLength(1);
    expect(events[0]!.op).toBe("remember");
  });

  it("filters by op, actor, target, and limit", async () => {
    const log = new InMemoryAuditLog({ now: fixed });
    const s = server(log);
    const { id } = await s.remember(draft("a"));
    await s.remember(draft("b"));
    await s.get(id, undefined, { did: AGENT });

    expect((await s.audit({ op: "remember" })).length).toBe(2);
    expect((await s.audit({ op: ["get", "recall"] })).length).toBe(1);
    expect((await s.audit({ actor: AGENT })).every((e) => e.actor?.did === AGENT)).toBe(true);
    expect((await s.audit({ target: id })).every((e) => e.targets?.includes(id))).toBe(true);
    expect((await s.audit({ limit: 1 })).length).toBe(1);
  });

  it("detects tampering: editing any event breaks the chain", async () => {
    const log = new InMemoryAuditLog({ now: fixed });
    const s = server(log);
    await s.remember(draft("a"));
    await s.remember(draft("b"));
    expect((await s.verifyAudit()).ok).toBe(true);

    // Mutate a persisted event in place.
    (log as unknown as { events: { result: string }[] }).events[0]!.result = "forged";
    const verdict = await s.verifyAudit();
    expect(verdict.ok).toBe(false);
    expect(verdict.brokenAt).toBe(1);
  });

  it("signs events with the operator key and verifies signatures", async () => {
    const log = new InMemoryAuditLog({ now: fixed, key: OWNER });
    const s = server(log, { sign: true });
    await s.remember(draft("signed memory"));
    const [event] = await s.audit();
    expect(event!.signer).toBe(OWNER.did);
    expect(event!.signature).toMatch(/^ed25519:/);
    expect((await s.verifyAudit()).ok).toBe(true);

    // Tampering with a signed event is caught by signature verification.
    (log as unknown as { events: { result: string }[] }).events[0]!.result = "forged";
    expect((await s.verifyAudit()).ok).toBe(false);
  });

  it("persists and replays across restarts (JsonlAuditLog)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ump-audit-"));
    const path = join(dir, "audit.log.jsonl");

    const log1 = await JsonlAuditLog.open(path, { key: OWNER, now: fixed });
    const s1 = server(log1, { sign: true });
    await s1.remember(draft("persisted"));
    await s1.remember(draft("second"));

    // Reopen from disk: history is intact and still verifies.
    const log2 = await JsonlAuditLog.open(path, { key: OWNER, now: fixed });
    const s2 = server(log2, { sign: true });
    const events = await s2.audit();
    expect(events.map((e) => e.op)).toEqual(["remember", "remember"]);
    expect((await s2.verifyAudit())).toEqual({ ok: true, count: 2 });

    // A new append continues the same chain.
    await s2.remember(draft("third"));
    expect((await s2.verifyAudit()).ok).toBe(true);
  });
});

describe("audit over the HTTP binding", () => {
  it("queries and verifies the trail; 400s when auditing is off", async () => {
    // Auditing enabled.
    const on = new UmpServer({
      name: "ump-ref", version: "1.0.0", store: new InMemoryStore(),
      now: fixed, audit: new InMemoryAuditLog({ now: fixed }),
    });
    await on.remember(draft("served over http"));
    const httpOn = createHttpServer(on);
    const base = await listen(httpOn);
    try {
      const q = await fetch(`${base}/ump/audit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: OWNER.did }),
      });
      expect(q.status).toBe(200);
      const { events } = (await q.json()) as { events: { op: string }[] };
      expect(events.map((e) => e.op)).toEqual(["remember"]);

      const v = await fetch(`${base}/ump/audit/verify`);
      expect(await v.json()).toEqual({ ok: true, count: 1 });
    } finally {
      httpOn.close();
    }

    // Auditing disabled -> the routes report unsupported.
    const httpOff = createHttpServer(server());
    const base2 = await listen(httpOff);
    try {
      const q = await fetch(`${base2}/ump/audit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(q.status).toBe(400);
      const err = (await q.json()) as { error: { code: string } };
      expect(err.error.code).toBe("unsupported");
    } finally {
      httpOff.close();
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
