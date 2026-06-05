import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type { MemoryDraft, MemoryKind, MemoryScope } from "../types.ts";

export type ImportSourceKind =
  | "claude"
  | "agents"
  | "recall"
  | "obsidian"
  | "generic_markdown";

export interface ImportSource {
  path: string;
  kind?: ImportSourceKind;
  project?: string;
}

export interface ImportOptions {
  owner: string;
  project?: string;
  visibility?: MemoryScope["visibility"];
  agent?: string;
  maxFileBytes?: number;
}

export interface ImportedMemoryDraft extends MemoryDraft {
  provenance: NonNullable<MemoryDraft["provenance"]>;
}

const DEFAULT_MAX_FILE_BYTES = 512_000;
const MARKDOWN_EXT = /\.(md|mdx|markdown)$/i;
const KNOWN_FILE_NAMES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "MEMORY.md",
  "context.md",
]);

export async function importMemorySources(
  sources: ImportSource[],
  opts: ImportOptions,
): Promise<ImportedMemoryDraft[]> {
  const out: ImportedMemoryDraft[] = [];
  for (const source of sources) {
    out.push(...await importMemorySource(source, opts));
  }
  return out;
}

export async function importMemorySource(
  source: ImportSource,
  opts: ImportOptions,
): Promise<ImportedMemoryDraft[]> {
  const info = await stat(source.path);
  if (info.isDirectory()) {
    const entries = await collectMarkdownFiles(source.path);
    const out: ImportedMemoryDraft[] = [];
    for (const path of entries) {
      out.push(...await importMemoryFile({ ...source, path }, opts));
    }
    return out;
  }
  return importMemoryFile(source, opts);
}

async function importMemoryFile(
  source: ImportSource,
  opts: ImportOptions,
): Promise<ImportedMemoryDraft[]> {
  const info = await stat(source.path);
  const maxBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (info.size > maxBytes) return [];

  const text = await readFile(source.path, "utf8");
  const kind = source.kind ?? inferSourceKind(source.path);
  const project = source.project ?? opts.project;
  const scope = {
    owner: opts.owner,
    project,
    agent: opts.agent,
    visibility: opts.visibility ?? "private",
  };

  return parseMarkdownMemory(text, {
    path: source.path,
    kind,
    scope,
  });
}

export function parseMarkdownMemory(
  text: string,
  ctx: {
    path: string;
    kind: ImportSourceKind;
    scope: MemoryDraft["scope"];
  },
): ImportedMemoryDraft[] {
  const body = stripFrontmatter(text).trim();
  if (!body) return [];
  const sections = splitMarkdownSections(body);
  return sections.map((section, index) => {
    const memoryKind = inferMemoryKind(ctx.kind, section.heading);
    return {
      kind: memoryKind,
      body: {
        text: section.text,
        structured: {
          source_kind: ctx.kind,
          source_path: ctx.path,
          heading: section.heading,
        },
      },
      scope: ctx.scope,
      lifecycle: { status: "candidate", confidence: confidenceFor(ctx.kind) },
      provenance: {
        actor: ctx.scope.owner,
        actor_kind: "import",
        method: `filesystem:${ctx.kind}`,
        source: { ref: `${ctx.path}${section.heading ? `#${slug(section.heading)}` : ""}` },
        evidence: [{ ref: ctx.path, weight: index === 0 ? 1 : 0.8 }],
      },
    } satisfies ImportedMemoryDraft;
  });
}

function inferSourceKind(path: string): ImportSourceKind {
  const name = basename(path);
  if (name === "CLAUDE.md") return "claude";
  if (name === "AGENTS.md") return "agents";
  if (path.includes(".recall/")) return "recall";
  if (path.includes("Obsidian") || path.includes("/Documents/main/")) return "obsidian";
  return "generic_markdown";
}

async function collectMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      if (KNOWN_FILE_NAMES.has(entry.name) || MARKDOWN_EXT.test(entry.name)) out.push(path);
    }
  }
  await walk(root);
  out.sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
  return out;
}

function stripFrontmatter(text: string): string {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---", 4);
  return end === -1 ? text : text.slice(end + 4);
}

function splitMarkdownSections(text: string): Array<{ heading?: string; text: string }> {
  const lines = text.split(/\r?\n/);
  const sections: Array<{ heading?: string; lines: string[] }> = [];
  let current: { heading?: string; lines: string[] } = { lines: [] };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading && current.lines.join("\n").trim()) {
      sections.push(current);
      current = { heading: heading[2]!.trim(), lines: [] };
      continue;
    }
    if (heading && !current.heading && current.lines.length === 0) {
      current.heading = heading[2]!.trim();
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.join("\n").trim()) sections.push(current);

  return sections.map((s) => ({
    heading: s.heading,
    text: s.lines.join("\n").trim(),
  })).filter((s) => s.text.length > 0);
}

function inferMemoryKind(source: ImportSourceKind, heading?: string): MemoryKind {
  const h = heading?.toLowerCase() ?? "";
  if (source === "agents" || source === "claude") return "procedural";
  if (h.includes("preference") || h.includes("identity")) return "identity";
  if (h.includes("decision") || h.includes("fact")) return "semantic";
  if (h.includes("incident") || h.includes("history")) return "episodic";
  return "semantic";
}

function confidenceFor(source: ImportSourceKind): number {
  if (source === "agents" || source === "claude") return 0.75;
  if (source === "recall") return 0.7;
  return 0.55;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
