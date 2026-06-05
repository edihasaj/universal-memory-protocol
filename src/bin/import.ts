#!/usr/bin/env node
/**
 * ump-import - import existing memory-ish files into portable UMP records.
 *
 * Examples:
 *   node --experimental-strip-types src/bin/import.ts --owner did:key:z... CLAUDE.md AGENTS.md
 *   node --experimental-strip-types src/bin/import.ts --owner did:key:z... --out .ump/import.ump.json ~/Documents/main
 */

import { writeFile } from "node:fs/promises";
import {
  file,
  importMemorySources,
  type ImportSource,
} from "../index.ts";

const args = process.argv.slice(2);
const owner = takeFlag("--owner") ?? process.env.UMP_OWNER;
const project = takeFlag("--project") ?? process.env.UMP_PROJECT;
const out = takeFlag("--out");
const sourceKind = takeFlag("--kind") as ImportSource["kind"] | undefined;

if (!owner || args.length === 0) {
  process.stderr.write("usage: ump-import --owner <did-or-owner> [--project repo] [--kind agents|claude|recall|obsidian|generic_markdown] [--out file.ump.json] <file-or-dir...>\n");
  process.exit(2);
}

const records = await importMemorySources(
  args.map((path) => ({ path, kind: sourceKind, project })),
  { owner, project },
);

const json = file.toJson(records as any);
if (out) {
  await writeFile(out, json, "utf8");
  process.stderr.write(`[ump-import] wrote ${records.length} records to ${out}\n`);
} else {
  process.stdout.write(json);
}

function takeFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}
