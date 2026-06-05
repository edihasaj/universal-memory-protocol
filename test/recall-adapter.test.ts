import { describe, it, expect } from "vitest";
import { UmpServer, generateKeyPair, verify } from "../src/index.ts";
import { RecallStore, type RecallBackend } from "../adapters/recall/store.ts";
import {
  recallMemoryToRecord,
  toAmpId,
  fromAmpId,
  recallTypeToKind,
  type RecallMemory,
} from "../adapters/recall/map.ts";

const OWNER = generateKeyPair(new Uint8Array(32).fill(3)).did;

const rows: RecallMemory[] = [
  {
    id: "11111111-2222-3333-4444-555555555555",
    text: "Use pnpm, never npm, in this repo",
    type: "rule",
    scope: "repo",
    status: "active",
    confidence: 0.82,
    repo: "edihasaj/recall",
    source: "user_correction",
    created_at: "2026-06-01T00:00:00Z",
    evidence: [{ ref: "sess#12" }],
  },
  {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    text: "Build can OOM above 4GB heap",
    type: "gotcha",
    scope: "global",
    status: "candidate",
    confidence: 0.4,
    repo: null,
    source: "scan",
    created_at: "2026-06-02T00:00:00Z",
  },
];

let storeSeq = 0;
function backend(): RecallBackend {
  const captured: { text: string }[] = [];
  const localRows: RecallMemory[] = rows.map((r) => ({ ...r })); // isolate per test
  return {
    queryMemories: () => localRows,
    getMemory: (id) => localRows.find((r) => r.id === id),
    compileHybrid: async ({ query }) =>
      localRows
        .filter((r) => r.status !== "rejected") // recall excludes rejected from retrieval
        .filter((r) => query.split(" ").some((w) => r.text.toLowerCase().includes(w.toLowerCase())))
        .map((memory) => ({ memory, score: 0.9 })),
    storeDirect: async ({ text, type, scope, repo, confidence, kind }) => {
      const id = `created-${++storeSeq}-aaaa-bbbb-cccc-dddddddddddd`;
      localRows.push({ id, text, type, scope, status: "active", confidence, repo: repo ?? null, capture_context: { ump_kind: kind } });
      return id;
    },
    tombstone: (id) => {
      const m = localRows.find((r) => r.id === id);
      if (!m) return false;
      m.status = "rejected";
      return true;
    },
    capture: async ({ text }) => {
      captured.push({ text });
      return { ids: [`new-${captured.length}`] };
    },
  };
}

describe("Recall ↔ UMP mapping", () => {
  it("maps types to kinds and round-trips ids", () => {
    expect(recallTypeToKind("rule")).toBe("procedural");
    expect(recallTypeToKind("decision")).toBe("semantic");
    expect(recallTypeToKind("gotcha")).toBe("episodic");
    const ump = toAmpId(rows[0]!.id);
    expect(ump).toMatch(/^urn:ump:[a-z2-7]+$/);
    expect(fromAmpId(ump)).toBe(rows[0]!.id);
  });

  it("maps a Recall memory to a valid UMP record", () => {
    const rec = recallMemoryToRecord(rows[0]!, OWNER);
    expect(rec.kind).toBe("procedural");
    expect(rec.scope.owner).toBe(OWNER);
    expect(rec.scope.project).toBe("edihasaj/recall");
    expect(rec.scope.visibility).toBe("private");
    expect(rec.lifecycle?.status).toBe("active");
    expect(rec.lifecycle?.confidence).toBe(0.82);
    // global-scoped recall memory → shared visibility
    expect(recallMemoryToRecord(rows[1]!, OWNER).scope.visibility).toBe("shared");
    expect(recallMemoryToRecord(rows[1]!, OWNER).lifecycle?.status).toBe("candidate");
  });
});

describe("RecallStore under UmpServer", () => {
  it("recalls Recall memories as UMP results with signals", async () => {
    const server = new UmpServer({
      name: "recall", version: "1.0.0", store: new RecallStore(backend(), { owner: OWNER }),
    });
    const res = await server.recall({ query: "pnpm package manager", scope: { owner: OWNER, project: "edihasaj/recall" } });
    expect(res.results.length).toBe(1);
    expect(res.results[0]!.record.body.text).toContain("pnpm");
    expect(res.results[0]!.signals.similarity).toBe(0.9);
  });

  it("get maps by id; remember routes into Recall capture", async () => {
    const be = backend();
    const server = new UmpServer({ name: "recall", version: "1.0.0", store: new RecallStore(be, { owner: OWNER }) });
    const got = await server.get(toAmpId(rows[0]!.id));
    expect(got.body.text).toContain("pnpm");

    const r = await server.remember({
      kind: "procedural", body: { text: "always run the gate" },
      scope: { owner: OWNER, project: "edihasaj/recall", visibility: "private" },
      provenance: { actor: OWNER, actor_kind: "user", method: "user_correction" },
    });
    expect(r.result).toBe("created");
  });

  it("faithful write: remember -> get round-trips by the returned id", async () => {
    const server = new UmpServer({ name: "recall", version: "1.0.0", store: new RecallStore(backend(), { owner: OWNER }) });
    const r = await server.remember({
      kind: "procedural", body: { text: "never deploy on fridays" },
      scope: { owner: OWNER, project: "edihasaj/recall", visibility: "private" },
      provenance: { actor: OWNER, actor_kind: "user", method: "user_correction" },
    });
    expect(r.result).toBe("created");
    expect(r.id).toMatch(/^urn:ump:[a-z2-7]+$/);
    // the id the server reports must resolve back to the stored record
    const got = await server.get(r.id);
    expect(got.body.text).toBe("never deploy on fridays");
    expect(got.kind).toBe("procedural");
  });

  it("preserves all five UMP kinds across write -> get (via capture-context)", async () => {
    const server = new UmpServer({ name: "recall", version: "1.0.0", store: new RecallStore(backend(), { owner: OWNER }) });
    for (const kind of ["semantic", "episodic", "procedural", "working", "identity"] as const) {
      const w = await server.remember({
        kind, body: { text: `fidelity ${kind}` },
        scope: { owner: OWNER, project: "p", visibility: "private" },
        provenance: { actor: OWNER, actor_kind: "user", method: "user_correction" },
      });
      const got = await server.get(w.id);
      expect(got.kind, `kind ${kind} should round-trip`).toBe(kind);
    }
  });

  it("forget tombstones so the memory drops out of recall", async () => {
    const server = new UmpServer({ name: "recall", version: "1.0.0", store: new RecallStore(backend(), { owner: OWNER }) });
    const w = await server.remember({
      kind: "working", body: { text: "scratch note qqzzx" },
      scope: { owner: OWNER, project: "p", visibility: "private" },
      provenance: { actor: OWNER, actor_kind: "user", method: "user_correction" },
    });
    await server.forget({ id: w.id, reason: "test" });
    const res = await server.recall({ query: "qqzzx scratch", scope: { owner: OWNER, project: "p" } });
    expect(res.results.some((r) => r.record.body.text.includes("qqzzx"))).toBe(false);
  });

  it("smart mode routes writes through the capture pipeline", async () => {
    const server = new UmpServer({ name: "recall", version: "1.0.0", store: new RecallStore(backend(), { owner: OWNER, smart: true }) });
    const r = await server.remember({
      kind: "procedural", body: { text: "smart capture path" },
      scope: { owner: OWNER, project: "edihasaj/recall", visibility: "private" },
      provenance: { actor: OWNER, actor_kind: "user", method: "user_correction" },
    });
    expect(r.result).toBe("created"); // capture owns judgement; server keeps record id
  });
});
