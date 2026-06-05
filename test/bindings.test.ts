import { describe, it, expect } from "vitest";
import {
  UmpServer,
  InMemoryStore,
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
