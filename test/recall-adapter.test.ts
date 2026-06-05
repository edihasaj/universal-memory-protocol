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

function backend(): RecallBackend {
  const captured: { text: string }[] = [];
  return {
    queryMemories: () => rows,
    getMemory: (id) => rows.find((r) => r.id === id),
    compileHybrid: async ({ query }) =>
      rows
        .filter((r) => query.split(" ").some((w) => r.text.toLowerCase().includes(w.toLowerCase())))
        .map((memory) => ({ memory, score: 0.9 })),
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
    // Recall owns lifecycle; capture returns created.
    expect(r.result).toBe("created");
  });
});
