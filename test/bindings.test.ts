import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  UmpServer,
  InMemoryStore,
  JsonFileStore,
  createMcpServer,
  createHttpHandler,
} from "../src/index.ts";

function srv() {
  return new UmpServer({
    name: "t",
    version: "0",
    store: new InMemoryStore(),
    now: () => new Date("2026-06-04T10:00:00Z"),
  });
}

describe("MCP binding (SPEC §4.1)", () => {
  it("constructs a Server exposing the UMP tool surface", () => {
    const server = createMcpServer(srv());
    expect(server).toBeDefined();
    // low-level Server exposes request-handler registration; construction
    // wiring all 7 ump.* tools must not throw.
    expect(typeof server.connect).toBe("function");
  });
});

describe("HTTP binding (SPEC §4.2)", () => {
  it("returns capabilities via the handler", async () => {
    const handler = createHttpHandler(srv());
    const { req, res, body } = mockHttp("GET", "/ump/capabilities");
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(body());
    expect(json.ump).toBe("0.1");
    expect(json.conformance).toBe("L1");
    expect(json.bindings).toContain("mcp");
  });

  it("404s unknown routes with an error envelope", async () => {
    const handler = createHttpHandler(srv());
    const { req, res, body } = mockHttp("GET", "/nope");
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(body()).error.code).toBe("not_found");
  });
});

describe("revise (SPEC §3) preserves record body shape", () => {
  async function seed(server: UmpServer) {
    return server.remember({
      kind: "semantic",
      body: { text: "hello" },
      scope: { owner: "did:key:zOwner", project: "p", visibility: "private" },
      provenance: { actor: "did:key:zOwner", actor_kind: "user", method: "user_correction" },
    });
  }

  it("keeps body as an object after a valid revise", async () => {
    const server = srv();
    const { id } = await seed(server);
    const { id: revisedId } = await server.revise({ id, patch: { body: { text: "hi2" } } });
    const got = await server.get(revisedId);
    expect(Array.isArray(got.body)).toBe(false);
    expect(got.body.text).toBe("hi2");
  });

  it("rejects a malformed body patch instead of corrupting the get format", async () => {
    const server = srv();
    const { id } = await seed(server);
    await expect(
      server.revise({ id, patch: { body: [{ text: "hi2" }] as unknown as { text: string } } }),
    ).rejects.toMatchObject({ code: "invalid_record" });
    const got = await server.get(id);
    expect(Array.isArray(got.body)).toBe(false);
    expect(got.body.text).toBe("hello");
  });
});

describe("JsonFileStore", () => {
  it("persists records as portable UMP JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ump-store-"));
    try {
      const path = join(dir, "memories.ump.json");
      const first = new UmpServer({
        name: "t",
        version: "0",
        store: await JsonFileStore.open(path),
        now: () => new Date("2026-06-04T10:00:00Z"),
      });
      const { id } = await first.remember({
        kind: "semantic",
        body: { text: "persist package manager preference" },
        scope: { owner: "did:key:zOwner", project: "p", visibility: "private" },
      });

      const second = new UmpServer({
        name: "t",
        version: "0",
        store: await JsonFileStore.open(path),
      });
      expect((await second.get(id)).body.text).toContain("persist package manager");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// Minimal IncomingMessage/ServerResponse doubles for the GET paths.
function mockHttp(method: string, url: string) {
  const listeners: Record<string, (arg?: unknown) => void> = {};
  const req = {
    method,
    url,
    headers: {} as Record<string, string>,
    on(ev: string, cb: (arg?: unknown) => void) {
      listeners[ev] = cb;
      if (ev === "end") cb();
      return req;
    },
  };
  let chunk = "";
  const res = {
    statusCode: 0,
    writeHead(code: number) {
      this.statusCode = code;
      return this;
    },
    end(data?: string) {
      if (data) chunk = data;
    },
  };
  return { req, res, body: () => chunk };
}
