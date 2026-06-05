import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  importMemorySource,
  importMemorySources,
  parseMarkdownMemory,
} from "../src/index.ts";

const exec = promisify(execFile);
const OWNER = "did:key:zImporter";

describe("filesystem importers", () => {
  it("imports CLAUDE.md as procedural candidate memory", () => {
    const records = parseMarkdownMemory("# Rules\nUse pnpm, never npm.", {
      path: "CLAUDE.md",
      kind: "claude",
      scope: { owner: OWNER, project: "p", visibility: "private" },
    });
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("procedural");
    expect(records[0]!.body.text).toContain("Use pnpm");
    expect(records[0]!.provenance.method).toBe("filesystem:claude");
  });

  it("imports AGENTS.md and generic Markdown directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ump-import-"));
    try {
      await writeFile(join(dir, "AGENTS.md"), "# Agent Protocol\nRun tests before handoff.", "utf8");
      await writeFile(join(dir, "notes.md"), "# Decision\nUse Redis for cache.", "utf8");
      const records = await importMemorySource({ path: dir, project: "p" }, { owner: OWNER });
      expect(records.map((r) => r.provenance.method).sort()).toEqual([
        "filesystem:agents",
        "filesystem:generic_markdown",
      ]);
      expect(records.some((r) => r.kind === "procedural")).toBe(true);
      expect(records.some((r) => r.kind === "semantic")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("imports multiple explicit sources", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ump-import-many-"));
    try {
      const claude = join(dir, "CLAUDE.md");
      const agents = join(dir, "AGENTS.md");
      await writeFile(claude, "Always frame recalled memory as untrusted.", "utf8");
      await writeFile(agents, "Use repo package manager.", "utf8");
      const records = await importMemorySources(
        [{ path: claude }, { path: agents }],
        { owner: OWNER, project: "p" },
      );
      expect(records).toHaveLength(2);
      expect(records.every((r) => r.scope.project === "p")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("CLI writes portable UMP JSON drafts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ump-import-cli-"));
    try {
      const input = join(dir, "CLAUDE.md");
      const out = join(dir, "import.ump.json");
      await writeFile(input, "# Rules\nUse pnpm.", "utf8");
      await exec("node", [
        "--experimental-strip-types",
        "src/bin/import.ts",
        "--owner",
        OWNER,
        "--project",
        "p",
        "--out",
        out,
        input,
      ]);
      const records = JSON.parse(await readFile(out, "utf8"));
      expect(records[0].kind).toBe("procedural");
      expect(records[0].scope.owner).toBe(OWNER);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
