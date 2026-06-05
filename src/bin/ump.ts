#!/usr/bin/env node
/**
 * ump - the Universal Memory Protocol CLI.
 *
 *   ump memory [--http <port>] [--store json|markdown] [--dir <path>]
 *   ump serve  [--http <port>]
 *   ump import --owner <did> [--project <repo>] [--out <file>] <paths...>
 *   ump conformance <url> [--token <cap>]
 *   ump demo
 */

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  UmpServer,
  InMemoryStore,
  createMcpServer,
  createHttpServer,
  generateKeyPair,
  rehydrate,
  file,
  importMemorySources,
  type ImportSource,
} from "../index.ts";
import { runConformance } from "../conformance.ts";
import { resolveDir, loadOrCreateKey, openStore, type StoreKind } from "../cli/runtime.ts";
import * as ui from "../cli/ui.ts";

const VERSION = readVersion();

const { flags, positionals } = parseArgs(process.argv.slice(2));
const cmd = positionals.shift();

if (flags.version || flags.v) {
  process.stdout.write(`ump ${VERSION}\n`);
  process.exit(0);
}
if (!cmd || cmd === "help" || flags.help || flags.h) {
  if (cmd && cmd !== "help") printCommandHelp(cmd); // exits inside
  printHelp();
  process.exit(cmd ? 0 : flags.help || flags.h ? 0 : 1);
}

switch (cmd) {
  case "memory": await memory(); break;
  case "serve": await serve(); break;
  case "import": await runImport(); break;
  case "conformance": await conformance(); break;
  case "demo": await demo(); break;
  default:
    ui.note(ui.err(`unknown command: ${cmd}`));
    printHelp();
    process.exit(1);
}

// ── commands ────────────────────────────────────────────────────────────

async function memory(): Promise<void> {
  if (flags.help || flags.h) return printCommandHelp("memory");
  const dir = resolveDir(str(flags.dir));
  const kind = (str(flags.store) ?? process.env.UMP_STORE ?? "json") as StoreKind;
  const key = loadOrCreateKey(dir);
  const { store, location } = await openStore(kind, dir);

  const server = new UmpServer({
    name: "ump-memory", version: VERSION, conformance: "L2", store, key,
  });

  const port = httpPort();
  if (port) createHttpServer(server, { wellKnown: { owner: key.did } }).listen(port, () => {});

  summary("memory", { owner: key.did, data: location, store: kind, port });
  await createMcpServer(server).connect(new StdioServerTransport());
}

async function serve(): Promise<void> {
  if (flags.help || flags.h) return printCommandHelp("serve");
  const key = generateKeyPair();
  const server = new UmpServer({
    name: "ump-serve", version: VERSION, conformance: "L3",
    store: new InMemoryStore(), key,
  });
  const port = httpPort();
  if (port) createHttpServer(server, { wellKnown: { owner: key.did } }).listen(port, () => {});
  summary("serve (ephemeral)", { owner: key.did, data: "in-memory", store: "memory", port });
  await createMcpServer(server).connect(new StdioServerTransport());
}

async function runImport(): Promise<void> {
  if (flags.help || flags.h || positionals.length === 0) return printCommandHelp("import");
  const owner = str(flags.owner) ?? process.env.UMP_OWNER;
  if (!owner) { ui.note(ui.err("--owner <did-or-owner> is required")); process.exit(2); }
  const project = str(flags.project) ?? process.env.UMP_PROJECT;
  const kind = str(flags.kind) as ImportSource["kind"] | undefined;

  const records = await importMemorySources(
    positionals.map((path) => ({ path, kind, project })),
    { owner, project },
  );
  const json = file.toJson(records as never);
  const out = str(flags.out);
  if (out) {
    await writeFile(out, json, "utf8");
    ui.note(ui.ok(`imported ${ui.bold(String(records.length))} records ${ui.arrow()} ${out}`));
  } else {
    process.stdout.write(json);
  }
}

async function conformance(): Promise<void> {
  const url = positionals[0];
  if (flags.help || flags.h || !url) return printCommandHelp("conformance");
  const report = await runConformance(url, { token: str(flags.token) });
  ui.note(`\n${ui.brand()}  conformance ${ui.dim(url)}\n`);
  for (const c of report.checks) {
    ui.note(`  ${c.ok ? ui.ok("") : ui.err("")}${ui.dim(`[${c.level}]`)} ${c.id}  ${ui.gray(c.detail)}`);
  }
  const good = report.level !== "none";
  ui.note(`\n  ${good ? ui.green(ui.bold(report.badge)) : ui.red(report.badge)}\n`);
  process.exit(good ? 0 : 1);
}

async function demo(): Promise<void> {
  const owner = generateKeyPair();
  ui.note(`\n${ui.brand()}  ${ui.dim("cross-vendor round-trip")}\n`);

  const a = new UmpServer({ name: "claude-code", version: VERSION, store: new InMemoryStore(), key: owner });
  const { id } = await a.remember({
    kind: "procedural",
    body: { text: "Always run `pnpm gate` before handoff in this repo." },
    scope: { owner: owner.did, project: "example/project", agent: "claude-code", visibility: "private" },
    provenance: { actor: owner.did, actor_kind: "user", method: "user_correction" },
  });
  ui.note(ui.ok(`agent A wrote ${ui.dim(id)} (signed, content-addressed)`));

  const exported = file.exportRecords(
    (await a.recall({ query: "handoff", scope: { owner: owner.did } })).results.map((r) => r.record),
  );
  ui.note(ui.ok(`exported to portable UMP JSON (${exported.length} record)`));

  const b = new UmpServer({ name: "codex", version: VERSION, store: new InMemoryStore() });
  for (const rec of file.fromJson(file.toJson(exported))) await b.remember(rec);
  ui.note(ui.ok("agent B imported it (signature verified across vendors)"));

  const hit = await b.recall({ query: "what should I do before I hand off?", scope: { owner: owner.did } });
  ui.note(ui.ok(`agent B recalled it ${ui.arrow()} injection-safe context:\n`));
  ui.note(rehydrate(hit.results).text + "\n");
}

// ── help ────────────────────────────────────────────────────────────────

function printHelp(): void {
  process.stdout.write(
    `\n${ui.brand()}  ${ui.dim("v" + VERSION)}\n\n` +
    `${ui.bold("Usage")}  ump <command> [options]\n\n` +
    `${ui.bold("Commands")}\n` +
    ui.list([
      ["memory", "Persistent MCP memory server (~/.ump) - the install wedge"],
      ["serve", "Ephemeral in-memory reference server"],
      ["import", "Import AGENTS.md / CLAUDE.md / Markdown into UMP records"],
      ["conformance", "Probe an endpoint and report its conformance level"],
      ["demo", "Run the cross-vendor round-trip"],
    ]) + "\n\n" +
    `${ui.bold("Options")}\n` +
    ui.list([
      ["-h, --help", "Show help (also: ump <command> --help)"],
      ["-v, --version", "Show version"],
    ]) + "\n\n" +
    `${ui.bold("Examples")}\n` +
    `  ${ui.gray("ump memory --http 4000")}\n` +
    `  ${ui.gray("ump memory --store markdown")}\n` +
    `  ${ui.gray("ump import --owner did:key:z... AGENTS.md CLAUDE.md")}\n` +
    `  ${ui.gray("ump conformance http://localhost:4000")}\n\n` +
    `${ui.dim("MCP host config:")} ${ui.gray('{ "command": "npx", "args": ["-y","@ump/core","ump-memory"] }')}\n\n`,
  );
}

function printCommandHelp(name: string): void {
  const help: Record<string, string> = {
    memory: "ump memory [--http <port>] [--store json|markdown] [--dir <path>]\n\nPersistent MCP memory server. Stable operator key + records under ~/.ump.\nEnv: UMP_DIR, UMP_STORE, UMP_HTTP.",
    serve: "ump serve [--http <port>]\n\nEphemeral in-memory reference server (nothing persisted).",
    import: "ump import --owner <did> [--project <repo>] [--kind agents|claude|recall|obsidian|generic_markdown] [--out <file>] <paths...>\n\nTranslate existing memory files into portable UMP records.",
    conformance: "ump conformance <url> [--token <cap>]\n\nProbe a UMP HTTP endpoint and report the highest level it proves.",
  };
  process.stdout.write(`\n${ui.brand()}\n\n${help[name] ?? "ump " + name}\n\n`);
  process.exit(0);
}

// ── helpers ───────────────────────────────────────────────────────────────

function summary(mode: string, o: { owner: string; data: string; store: string; port?: number }): void {
  const bindings = `MCP ${ui.dim("(stdio)")}` + (o.port ? `, HTTP ${ui.dim(":" + o.port)}` : "");
  ui.note(
    `\n${ui.brand()}  ${ui.dim(mode)}\n` +
    ui.row("owner", o.owner) + "\n" +
    ui.row("data", o.data) + "\n" +
    ui.row("store", o.store) + "\n" +
    ui.row("bindings", bindings) + "\n",
  );
}

function httpPort(): number | undefined {
  const v = str(flags.http) ?? process.env.UMP_HTTP;
  return v ? Number(v) : undefined;
}

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function parseArgs(argv: string[]): {
  flags: Record<string, string | boolean>;
  positionals: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    } else if (a.startsWith("-") && a.length > 1) {
      flags[a.slice(1)] = true;
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals };
}

function readVersion(): string {
  try {
    return JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
  } catch {
    return "0.1.0";
  }
}
