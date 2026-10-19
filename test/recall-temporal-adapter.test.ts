import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateKeyPair,
  InMemoryStore,
  JsonFileStore,
  UmpServer,
} from "../src/index.ts";
import type { MemoryRecord } from "../src/types.ts";
import {
  RecallStore,
  type RecallBackend,
} from "../adapters/recall/store.ts";
import {
  kindToRecallType,
  toUmpId,
  type RecallMemory,
} from "../adapters/recall/map.ts";

const OWNER = generateKeyPair(new Uint8Array(32).fill(8)).did;
const OTHER_OWNER = generateKeyPair(new Uint8Array(32).fill(9)).did;
const NOW = "2026-01-10T00:00:00Z";

function record(
  id: string,
  text: string,
  time: Partial<MemoryRecord["time"]> = {},
  owner = OWNER,
): MemoryRecord {
  return {
    ump: "1.0",
    id: toUmpId(id),
    kind: "semantic",
    body: { text },
    scope: { owner, project: "p", visibility: "private" },
    time: {
      created: "2026-01-01T00:00:00Z",
      observed: "2026-01-01T00:00:00Z",
      valid_from: "2026-01-01T00:00:00Z",
      valid_to: null,
      ...time,
    },
    lifecycle: { status: "active", confidence: 0.8, salience: 0.8 },
    provenance: { actor: owner, actor_kind: "user", method: "test" },
  };
}

function row(
  id: string,
  text: string,
  time: Partial<MemoryRecord["time"]> = {},
  owner = OWNER,
): RecallMemory {
  return {
    id,
    text,
    type: "decision",
    scope: "repo",
    status: "active",
    confidence: 0.8,
    repo: "p",
    capture_context: { ump_record: record(id, text, time, owner) },
  };
}

function nativeBackend(initial: RecallMemory[] = []) {
  const rows = initial.map((memory) => structuredClone(memory));
  const puts: Array<{ record: MemoryRecord; existingId?: string }> = [];
  const captures: MemoryRecord[] = [];
  const compileRequests: Parameters<RecallBackend["compileHybrid"]>[0][] = [];
  let next = 0;

  const backend: RecallBackend = {
    queryMemories: () => rows,
    getMemory: (id) => rows.find((memory) => memory.id === id),
    compileHybrid: async (request) => {
      compileRequests.push(request);
      return rows
        .slice(0, request.limit)
        .map((memory, index) => ({ memory, score: 1 - index / 10 }));
    },
    putRecord: async (saved, existingId) => {
      puts.push({ record: structuredClone(saved), existingId });
      const id = existingId ?? `native-${++next}`;
      const native: RecallMemory = {
        id,
        text: saved.body.text,
        type: kindToRecallType(saved.kind),
        scope: saved.scope.project ? "repo" : "global",
        status: saved.lifecycle?.status === "tombstoned" ? "rejected" : "active",
        confidence: saved.lifecycle?.confidence ?? 0.8,
        repo: saved.scope.project ?? null,
        capture_context: { ump_record: structuredClone(saved) },
      };
      const index = rows.findIndex((memory) => memory.id === id);
      if (index === -1) rows.push(native);
      else rows[index] = native;
      return id;
    },
    storeDirect: async () => {
      throw new Error("native backend must use putRecord");
    },
    tombstone: () => false,
    capture: async ({ ump_record }) => {
      if (ump_record) captures.push(structuredClone(ump_record));
      return { ids: ["capture"] };
    },
  };
  return { backend, rows, puts, captures, compileRequests };
}

function legacyBackend() {
  const rows: RecallMemory[] = [];
  const direct: string[] = [];
  const captures: string[] = [];
  const backend: RecallBackend = {
    queryMemories: () => rows,
    getMemory: (id) => rows.find((memory) => memory.id === id),
    compileHybrid: async () => [],
    storeDirect: async (input) => {
      direct.push(input.text);
      const id = `legacy-${direct.length}`;
      rows.push({
        id,
        text: input.text,
        type: input.type,
        scope: input.scope,
        status: "active",
        confidence: input.confidence,
        repo: input.repo ?? null,
        capture_context: { ump_kind: input.kind },
      });
      return id;
    },
    tombstone: (id) => {
      const found = rows.find((memory) => memory.id === id);
      if (!found) return false;
      found.status = "rejected";
      return true;
    },
    capture: async ({ text }) => {
      captures.push(text);
      return { ids: ["capture"] };
    },
  };
  return { backend, direct, captures };
}

describe("Recall temporal adapter retrieval", () => {
  it("filters future, expired, tombstoned, and wrong-scope rows before the requested limit", async () => {
    const fixture = nativeBackend([
      row("future", "hosting provider", { valid_from: "2026-02-01T00:00:00Z" }),
      row("expired", "hosting provider", { valid_to: "2026-01-09T23:59:59Z" }),
      row("wrong-scope", "hosting provider", {}, OTHER_OWNER),
      row(
        "eligible",
        "hosting provider",
        {
          valid_from: "2026-01-10T02:00:00+02:00",
          valid_to: "2026-01-10T04:00:00+02:00",
        },
      ),
    ]);
    fixture.rows[2]!.status = "rejected";
    const store = new RecallStore(fixture.backend, {
      owner: OWNER,
      now: () => new Date(NOW),
    });

    const results = await store.search({
      query: "hosting provider",
      scope: { owner: OWNER, project: "p" },
      limit: 1,
    });

    expect(results.map((result) => result.record.id)).toEqual([toUmpId("eligible")]);
    expect(fixture.compileRequests[0]).toMatchObject({
      limit: 4,
      filter: { valid_at: new Date(NOW).toISOString() },
      scope: { owner: OWNER, project: "p" },
    });
  });

  it("keeps inclusive validity boundaries and supports explicit future lookup", async () => {
    const fixture = nativeBackend([
      row("current", "release channel", { valid_to: NOW }),
      row("future", "release channel", { valid_from: "2026-02-01T00:00:00Z" }),
    ]);
    const store = new RecallStore(fixture.backend, {
      owner: OWNER,
      now: () => new Date(NOW),
    });

    const current = await store.search({
      query: "release channel",
      scope: { owner: OWNER, project: "p" },
    });
    const future = await store.search({
      query: "release channel",
      scope: { owner: OWNER, project: "p" },
      filter: { valid_at: "2026-02-01T00:00:00Z" },
    });

    expect(current.map((result) => result.record.id)).toEqual([toUmpId("current")]);
    expect(future.map((result) => result.record.id)).toEqual([toUmpId("future")]);
  });

  it("rejects an invalid historical instant before calling the backend", async () => {
    const fixture = nativeBackend([row("current", "release channel")]);
    const server = new UmpServer({
      name: "recall",
      version: "1.0.3",
      store: new RecallStore(fixture.backend, { owner: OWNER }),
    });

    for (const validAt of [
      "2026-02-30T00:00:00Z",
      "2026-01-10T00:00:00.123456Z",
    ]) {
      await expect(server.recall({
        query: "release channel",
        scope: { owner: OWNER, project: "p" },
        filter: { valid_at: validAt },
      })).rejects.toThrow("filter.valid_at must be a valid RFC 3339");
    }
    expect(fixture.compileRequests).toEqual([]);
  });
});

describe("Recall temporal adapter persistence", () => {
  it("round-trips complete UMP metadata with canonical native ids and no stale signature", async () => {
    const fixture = nativeBackend();
    const server = new UmpServer({
      name: "recall",
      version: "1.0.3",
      key: generateKeyPair(new Uint8Array(32).fill(5)),
      store: new RecallStore(fixture.backend, { owner: OWNER }),
    });
    const written = await server.remember({
      kind: "semantic",
      body: { text: "the release owner is Ada", structured: { owner: "Ada" } },
      scope: {
        owner: OWNER,
        user: "did:key:user",
        project: "p",
        agent: "release-agent",
        session: "session-1",
        visibility: "private",
      },
      time: {
        created: "2026-01-01T00:00:00Z",
        observed: "2026-01-02T00:00:00Z",
        valid_from: "2026-01-03T00:00:00Z",
        valid_to: "2026-02-01T00:00:00Z",
      },
      lifecycle: { status: "candidate", confidence: 0.91, salience: 0.7 },
      relations: [{ type: "about", target: "entity:release" }],
      supersedes: [toUmpId("prior")],
      provenance: {
        actor: OWNER,
        actor_kind: "user",
        method: "user_correction",
        evidence: [{ ref: "session:1" }],
      },
    });
    const restored = await server.get(written.id);

    expect(written.id).toBe(toUmpId("native-1"));
    expect(restored.body).toEqual({
      text: "the release owner is Ada",
      structured: { owner: "Ada" },
    });
    expect(restored.scope.agent).toBe("release-agent");
    expect(restored.time).toEqual({
      created: "2026-01-01T00:00:00Z",
      observed: "2026-01-02T00:00:00Z",
      valid_from: "2026-01-03T00:00:00Z",
      valid_to: "2026-02-01T00:00:00Z",
    });
    expect(restored.relations).toEqual([{ type: "about", target: "entity:release" }]);
    expect(restored.supersedes).toEqual([toUmpId("prior")]);
    expect(restored.lifecycle).toMatchObject({ status: "candidate", confidence: 0.91 });
    expect(restored.integrity).toBeUndefined();
  });

  it("preserves an earlier prior expiry for a later successor and links the canonical successor id", async () => {
    const fixture = nativeBackend();
    const server = new UmpServer({
      name: "recall",
      version: "1.0.3",
      now: () => new Date("2026-01-15T00:00:00Z"),
      store: new RecallStore(fixture.backend, { owner: OWNER }),
    });
    const prior = await server.remember({
      kind: "semantic",
      body: { text: "hosting is Azure" },
      scope: { owner: OWNER, project: "p", visibility: "private" },
      time: {
        created: "2026-01-01T00:00:00Z",
        valid_from: "2026-01-01T00:00:00Z",
        valid_to: "2026-01-10T00:00:00Z",
      },
    });

    const revision = await server.revise({
      id: prior.id,
      patch: {
        body: { text: "hosting is Cloudflare" },
        time: {
          observed: "2026-01-14T00:00:00Z",
          valid_from: "2026-01-12T00:00:00Z",
        },
      },
    });
    const closed = await server.get(prior.id);
    const successor = await server.get(revision.id);

    expect(closed.time.valid_to).toBe("2026-01-10T00:00:00Z");
    expect(closed.superseded_by).toContain(revision.id);
    expect(successor.time.observed).toBe("2026-01-14T00:00:00Z");
    expect(successor.time.valid_from).toBe("2026-01-12T00:00:00Z");

    const writesBeforeInvalidRevision = fixture.puts.length;
    await expect(server.revise({
      id: prior.id,
      patch: { time: { valid_from: "2025-12-31T00:00:00Z" } },
    })).rejects.toThrow("would close the prior before its valid_from");
    await expect(server.revise({
      id: prior.id,
      patch: { time: { valid_from: "2026-01-20T00:00:00Z", valid_to: "2026-01-19T00:00:00Z" } },
    })).rejects.toThrow("valid_to must not be before");
    await expect(server.revise({
      id: prior.id,
      patch: { time: { observed: "2026-02-30T00:00:00Z" } },
    })).rejects.toThrow("observed must be a valid RFC 3339");
    await expect(server.revise({
      id: prior.id,
      patch: {
        time: {
          valid_from: "2026-01-02T00:00:00.123456Z",
          valid_to: "2026-01-02T00:00:00.123455Z",
        },
      },
    })).rejects.toThrow("valid_from must be a valid RFC 3339");
    expect(fixture.puts).toHaveLength(writesBeforeInvalidRevision);
  });
});

describe("legacy Recall temporal compatibility", () => {
  it("permits server-generated ordinary timestamps but rejects explicit equal past or future timestamps before writes", async () => {
    const fixture = legacyBackend();
    const server = new UmpServer({
      name: "legacy-recall",
      version: "1.0.3",
      now: () => new Date(NOW),
      store: new RecallStore(fixture.backend, { owner: OWNER }),
    });
    const ordinary = await server.remember({
      kind: "semantic",
      body: { text: "ordinary memory" },
      scope: { owner: OWNER, project: "p", visibility: "private" },
    });
    expect(fixture.direct).toEqual(["ordinary memory"]);

    for (const timestamp of ["2020-01-01T00:00:00Z", "2099-01-01T00:00:00Z"]) {
      await expect(server.remember({
        kind: "semantic",
        body: { text: timestamp },
        scope: { owner: OWNER, project: "p", visibility: "private" },
        time: { created: timestamp, observed: timestamp, valid_from: timestamp },
      })).rejects.toThrow("does not preserve observation or validity timestamps");
    }
    await expect(server.remember({
      id: ordinary.id,
      kind: "semantic",
      body: { text: "must not no-op an explicit update" },
      scope: { owner: OWNER, project: "p", visibility: "private" },
      time: {
        created: "2020-01-01T00:00:00Z",
        observed: "2020-01-01T00:00:00Z",
        valid_from: "2020-01-01T00:00:00Z",
      },
    })).rejects.toThrow("does not preserve observation or validity timestamps");
    expect(fixture.direct).toEqual(["ordinary memory"]);
  });

  it("keeps smart capture for ordinary writes even with a native backend, and rejects explicit temporal capture", async () => {
    const fixture = nativeBackend();
    const server = new UmpServer({
      name: "smart-recall",
      version: "1.0.3",
      now: () => new Date(NOW),
      store: new RecallStore(fixture.backend, { owner: OWNER, smart: true }),
    });
    await server.remember({
      kind: "semantic",
      body: { text: "capture this" },
      scope: { owner: OWNER, project: "p", visibility: "private" },
    });
    expect(fixture.captures).toHaveLength(1);
    expect(fixture.puts).toHaveLength(0);

    await expect(server.remember({
      kind: "semantic",
      body: { text: "do not flatten this" },
      scope: { owner: OWNER, project: "p", visibility: "private" },
      time: {
        created: "2020-01-01T00:00:00Z",
        observed: "2020-01-01T00:00:00Z",
        valid_from: "2020-01-01T00:00:00Z",
      },
    })).rejects.toThrow("does not preserve observation or validity timestamps");
    expect(fixture.captures).toHaveLength(1);
  });

  it("rejects malformed time containers before a legacy backend writes or captures", async () => {
    const fixture = legacyBackend();
    const server = new UmpServer({
      name: "legacy-recall",
      version: "1.0.3",
      store: new RecallStore(fixture.backend, { owner: OWNER, smart: true }),
    });
    for (const time of [null, "not-a-time-object", []]) {
      await expect(server.remember({
        kind: "semantic",
        body: { text: "invalid time container" },
        scope: { owner: OWNER, project: "p", visibility: "private" },
        time: time as never,
      })).rejects.toThrow("time must be an object");
    }
    expect(fixture.direct).toEqual([]);
    expect(fixture.captures).toEqual([]);
  });
});

describe("reference-store temporal deduplication", () => {
  it("does not merge an ordinary current assertion into a future explicit record", async () => {
    const currentAssertion = {
      kind: "semantic" as const,
      body: { text: "hosting is Azure" },
      scope: { owner: OWNER, project: "p", visibility: "private" as const },
    };
    const addFuture = async (server: UmpServer) => server.remember({
      kind: "semantic",
      body: { text: "hosting is Azure" },
      scope: { owner: OWNER, project: "p", visibility: "private" },
      time: {
        created: "2099-01-01T00:00:00Z",
        observed: "2099-01-01T00:00:00Z",
        valid_from: "2099-01-01T00:00:00Z",
      },
    });
    const assertCurrent = async (
      store: InMemoryStore | JsonFileStore,
      server: UmpServer,
    ) => {
      const current = await server.remember(currentAssertion);
      const duplicate = await server.remember(currentAssertion);
      expect(current.result).toBe("created");
      expect(duplicate).toMatchObject({ id: current.id, result: "merged" });
      expect(await store.all()).toHaveLength(2);
      await expect(server.recall({
        query: "hosting Azure",
        scope: { owner: OWNER, project: "p" },
      })).resolves.toMatchObject({ results: [{ record: { id: current.id } }] });
    };
    const inMemory = new InMemoryStore();
    const inMemoryServer = new UmpServer({
      name: "reference",
      version: "1.0.3",
      now: () => new Date(NOW),
      store: inMemory,
    });
    await addFuture(inMemoryServer);
    await assertCurrent(inMemory, inMemoryServer);

    const directory = await mkdtemp(join(tmpdir(), "ump-temporal-reopen-"));
    try {
      const file = join(directory, "memory.ump.json");
      const initial = await JsonFileStore.open(file);
      await addFuture(new UmpServer({
        name: "reference",
        version: "1.0.3",
        now: () => new Date(NOW),
        store: initial,
      }));
      const reopened = await JsonFileStore.open(file);
      await assertCurrent(reopened, new UmpServer({
        name: "reference",
        version: "1.0.3",
        now: () => new Date(NOW),
        store: reopened,
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("merges ordinary duplicates after reopening JsonFileStore", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ump-ordinary-reopen-"));
    try {
      const file = join(directory, "memory.ump.json");
      const ordinary = {
        kind: "semantic" as const,
        body: { text: "ordinary duplicate" },
        scope: { owner: OWNER, project: "p", visibility: "private" as const },
      };
      const first = await JsonFileStore.open(file);
      const original = await new UmpServer({
        name: "reference",
        version: "1.0.3",
        now: () => new Date(NOW),
        store: first,
      }).remember(ordinary);
      const reopened = await JsonFileStore.open(file);
      const duplicate = await new UmpServer({
        name: "reference",
        version: "1.0.3",
        now: () => new Date("2026-01-10T00:00:01Z"),
        store: reopened,
      }).remember(ordinary);

      expect(duplicate).toMatchObject({ id: original.id, result: "merged" });
      expect(await reopened.all()).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retains explicit temporal history while ordinary undated duplicates still merge", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ump-temporal-dedup-"));
    try {
      const stores = [
        new InMemoryStore(),
        await JsonFileStore.open(join(directory, "memory.ump.json")),
      ];
      for (const store of stores) {
        const server = new UmpServer({
          name: "reference",
          version: "1.0.3",
          now: () => new Date(NOW),
          store,
        });
        const first = await server.remember({
          kind: "semantic",
          body: { text: "hosting is Azure" },
          scope: { owner: OWNER, project: "p", visibility: "private" },
          time: {
            created: "2026-01-01T00:00:00Z",
            observed: "2026-01-01T00:00:00Z",
            valid_from: "2026-01-01T00:00:00Z",
            valid_to: "2026-02-01T00:00:00Z",
          },
        });
        const second = await server.remember({
          kind: "semantic",
          body: { text: "hosting is Azure" },
          scope: { owner: OWNER, project: "p", visibility: "private" },
          time: {
            created: "2026-07-01T00:00:00Z",
            observed: "2026-07-02T00:00:00Z",
            valid_from: "2026-07-01T00:00:00Z",
            valid_to: "2026-08-01T00:00:00Z",
          },
        });
        const ordinary = {
          kind: "semantic" as const,
          body: { text: "ordinary duplicate" },
          scope: { owner: OWNER, project: "p", visibility: "private" as const },
        };
        const ordinaryFirst = await server.remember(ordinary);
        const ordinarySecond = await server.remember(ordinary);

        expect(first.result).toBe("created");
        expect(second.result).toBe("created");
        expect(ordinaryFirst.result).toBe("created");
        expect(ordinarySecond).toMatchObject({
          id: ordinaryFirst.id,
          result: "merged",
        });
        expect(await store.all()).toHaveLength(3);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
