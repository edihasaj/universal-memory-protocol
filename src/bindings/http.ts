/**
 * HTTP binding (SPEC §4.2). JSON over HTTP for non-MCP consumers
 * (web apps, ChatGPT actions, daemons). Dependency-free node:http.
 *
 *   GET  /amp/capabilities
 *   POST /amp/recall      POST /amp/remember
 *   GET  /amp/memory/{id} POST /amp/revise   POST /amp/forget   POST /amp/feedback
 *
 * Auth (capability tokens, §5.2) is left to a caller-supplied `authorize` hook.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AmpServer } from "../server.ts";
import { AmpError } from "../types.ts";

export interface HttpBindingOptions {
  /** Return true to allow the request. Receives method+path+bearer token. */
  authorize?: (ctx: { method: string; path: string; token?: string }) => boolean;
}

export function createHttpHandler(server: AmpServer, opts: HttpBindingOptions = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || undefined;

    if (opts.authorize && !opts.authorize({ method: req.method ?? "GET", path, token })) {
      return send(res, 401, { error: { code: "unauthorized", message: "denied" } });
    }

    try {
      if (req.method === "GET" && path === "/amp/capabilities") {
        return send(res, 200, server.capabilities());
      }
      if (req.method === "GET" && path.startsWith("/amp/memory/")) {
        const id = decodeURIComponent(path.slice("/amp/memory/".length));
        return send(res, 200, { record: await server.get(id) });
      }
      if (req.method === "POST") {
        const body = await readJson(req);
        switch (path) {
          case "/amp/recall":   return send(res, 200, await server.recall(body));
          case "/amp/remember": return send(res, 200, await server.remember(body.record ?? body));
          case "/amp/revise":   return send(res, 200, await server.revise(body));
          case "/amp/forget":   return send(res, 200, await server.forget(body));
          case "/amp/feedback": return send(res, 200, await server.feedback(body));
        }
      }
      return send(res, 404, { error: { code: "not_found", message: "no route" } });
    } catch (e) {
      if (e instanceof AmpError) {
        const status = e.code === "not_found" ? 404 : e.code === "unauthorized" ? 401 : 400;
        return send(res, status, { error: { code: e.code, message: e.message } });
      }
      return send(res, 500, { error: { code: "internal", message: String(e) } });
    }
  };
}

export function createHttpServer(server: AmpServer, opts?: HttpBindingOptions) {
  return createServer(createHttpHandler(server, opts));
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(json);
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new AmpError("invalid_record", "bad json"));
      }
    });
    req.on("error", reject);
  });
}
