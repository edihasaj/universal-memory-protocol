/**
 * The money shot (ADOPTION.md §4): a memory written by one agent, recalled by
 * another, exported to a portable file, and re-imported into a third server -
 * across "vendors", verifiable end to end. Run:
 *   node --experimental-strip-types examples/round-trip.ts
 */

import {
  AmpServer,
  InMemoryStore,
  generateKeyPair,
  rehydrate,
  verify,
  canonicalize,
  file,
} from "../src/index.ts";

const owner = generateKeyPair();
const log = (...a: unknown[]) => console.log(...a);

// ── Agent A (say, Claude Code) writes a correction ──────────────────────
const claude = new AmpServer({ name: "claude-code", version: "1", store: new InMemoryStore(), key: owner });
const w = await claude.remember({
  kind: "procedural",
  body: { text: "Always run `pnpm gate` before handoff in this repo." },
  scope: { owner: owner.did, project: "edihasaj/recall", agent: "claude-code", visibility: "private" },
  provenance: { actor: owner.did, actor_kind: "user", method: "user_correction" },
});
log("A wrote:", w.id, "(signed, content-addressed)");

// Export A's memory to the portable file format.
const records = await claude.recall({ query: "handoff gate", scope: { owner: owner.did } });
const exported = file.exportRecords(records.results.map((r) => r.record));
const json = file.toJson(exported);
log("\n- portable .amp.json -\n" + json.trim());

// ── Agent B (say, Codex) imports the file into its own store ─────────────
const codex = new AmpServer({ name: "codex", version: "1", store: new InMemoryStore() });
for (const rec of file.fromJson(json)) {
  log(`\nB importing ${rec.id} - signature valid: ${verify(rec)}`);
  await codex.remember(rec); // already signed; carried across vendors intact
}

// B recalls it for a different query and safely rehydrates into context.
const recalled = await codex.recall({ query: "what should I do before I hand off?", scope: { owner: owner.did } });
log(`\nB recalled ${recalled.results.length} memory; injection-safe context block:\n`);
const { text } = rehydrate(recalled.results);
log(text);

// ── Markdown projection round-trips losslessly ──────────────────────────
const md = file.toMarkdown(exported[0]!);
const back = file.fromMarkdown(md);
log("\nMarkdown round-trip lossless:", canonicalize(back) === canonicalize(exported[0]));
log("\n✓ write→recall→export→import→recall across vendors, signature intact.");
