/**
 * HTTP binding (SPEC §4.2). JSON over HTTP for non-MCP consumers
 * (web apps, ChatGPT actions, daemons). Dependency-free node:http.
 *
 *   GET  /ump/capabilities          GET  /.well-known/ump.json
 *   POST /ump/recall      POST /ump/remember     GET  /ump/memory/{id}
 *   POST /ump/revise      POST /ump/forget       POST /ump/feedback
 *   GET  /ump/subscribe   (Server-Sent Events stream of record changes)
 *   POST /ump/audit       GET  /ump/audit/verify  (audit trail, SPEC §9)
 *
 * Capability tokens (§5.2) are enforced when `requireCapability` is set:
 * a verb is derived per route and checked against the bearer token's grant.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { UmpServer } from "../server.ts";
import { UmpError, type MemoryScope } from "../types.ts";
import { buildWellKnown, type WellKnownManifest } from "../wellknown.ts";
import {
  allows,
  verifyCapability,
  type CapabilityClaims,
  type CapabilityVerb,
} from "../capability.ts";

export interface HttpBindingOptions {
  /** Free-form gate (runs before capability checks). Return false to 401. */
  authorize?: (ctx: { method: string; path: string; token?: string }) => boolean;
  /** Enforce capability tokens (§5.2) on every non-public route. */
  requireCapability?: { now?: () => Date };
  /** Extra fields for the discovery manifest. */
  wellKnown?: { endpoint?: string; exports?: WellKnownManifest["exports"]; owner?: string };
}

export function createHttpHandler(server: UmpServer, opts: HttpBindingOptions = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || undefined;

    if (opts.authorize && !opts.authorize({ method, path, token })) {
      return send(res, 401, { error: { code: "unauthorized", message: "denied" } });
    }

    try {
      // Public routes - no capability required.
      if (method === "GET" && path === "/ump/capabilities") {
        return send(res, 200, server.capabilities());
      }
      if (method === "GET" && path === "/.well-known/ump.json") {
        return send(res, 200, buildWellKnown(server.capabilities(), opts.wellKnown ?? {}));
      }

      // SSE subscribe stream.
      if (method === "GET" && path === "/ump/subscribe") {
        capGate(opts, "read", scopeFromQuery(url), token);
        return streamSubscribe(server, res, scopeFromQuery(url));
      }

      // Audit trail (SPEC §9): read-only chain verification + query.
      if (method === "GET" && path === "/ump/audit/verify") {
        capGate(opts, "read", { owner: url.searchParams.get("owner") ?? undefined }, token);
        return send(res, 200, await server.verifyAudit());
      }

      if (method === "GET" && path.startsWith("/ump/memory/")) {
        const id = decodeURIComponent(path.slice("/ump/memory/".length));
        const record = await server.peek(id);
        const claims = capGate(opts, "read", record.scope, token);
        return send(res, 200, { record: await server.get(id, claims?.scope) });
      }

      if (method === "POST") {
        const body = await readJson(req);
        switch (path) {
          case "/ump/recall":
            capGate(opts, "read", body.scope ?? {}, token);
            return send(res, 200, await server.recall(body));
          case "/ump/remember":
            capGate(opts, "write", (body.record ?? body)?.scope ?? {}, token);
            return send(res, 200, await server.remember(body.record ?? body));
          case "/ump/revise": {
            const record = await server.peek(body.id);
            capGate(opts, "write", record.scope, token);
            return send(res, 200, await server.revise(body));
          }
          case "/ump/forget": {
            const record = await server.peek(body.id);
            capGate(opts, "write", record.scope, token);
            return send(res, 200, await server.forget(body));
          }
          case "/ump/feedback": {
            const record = await server.peek(body.id);
            capGate(opts, "derive", record.scope, token);
            return send(res, 200, await server.feedback(body));
          }
          case "/ump/audit":
            capGate(opts, "read", { owner: body.owner }, token);
            return send(res, 200, { events: await server.audit(body) });
        }
      }
      return send(res, 404, { error: { code: "not_found", message: "no route" } });
    } catch (e) {
      if (e instanceof UmpError) {
        const status =
          e.code === "not_found" ? 404 :
          e.code === "unauthorized" ? 401 :
          e.code === "forbidden_scope" ? 403 : 400;
        return send(res, status, { error: { code: e.code, message: e.message } });
      }
      return send(res, 500, { error: { code: "internal", message: String(e) } });
    }
  };
}

export function createHttpServer(server: UmpServer, opts?: HttpBindingOptions) {
  return createServer(createHttpHandler(server, opts));
}

// ── capability enforcement ──────────────────────────────────────────────

function capGate(
  opts: HttpBindingOptions,
  verb: CapabilityVerb,
  scope: Partial<MemoryScope>,
  token?: string,
): CapabilityClaims | undefined {
  if (!opts.requireCapability) return undefined;
  if (!token) throw new UmpError("unauthorized", "capability token required");
  const v = verifyCapability(token, opts.requireCapability.now?.());
  if (!v.valid || !v.claims) throw new UmpError("unauthorized", `token ${v.reason}`);
  if (!allows(v.claims, verb, scope)) {
    throw new UmpError("forbidden_scope", `token does not grant ${verb} on this scope`);
  }
  return v.claims;
}

function scopeFromQuery(url: URL): Partial<MemoryScope> {
  const scope: Partial<MemoryScope> = {};
  for (const k of ["owner", "project", "agent"] as const) {
    const v = url.searchParams.get(k);
    if (v) scope[k] = v;
  }
  return scope;
}

// ── SSE ─────────────────────────────────────────────────────────────────

function streamSubscribe(server: UmpServer, res: ServerResponse, scope: Partial<MemoryScope>) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write(": ump subscribe open\n\n");
  const unsub = server.subscribe((e) => {
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  }, scope);
  res.on("close", unsub);
}

// ── helpers ───────────────────────────────────────────────────────────────

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new UmpError("invalid_record", "bad json"));
      }
    });
    req.on("error", reject);
  });
}
