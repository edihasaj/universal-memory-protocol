import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fromMarkdown, toMarkdown } from "../bindings/file.ts";
import { MirrorStore } from "./mirror.ts";
import type { MemoryRecord } from "../types.ts";

/**
 * Human-editable persistent store: one `*.ump.md` file per record.
 *
 * Useful for repos, Obsidian-style workflows, and any deployment where a memory
 * export should be inspectable and editable without a database server.
 */
export class MarkdownDirectoryStore extends MirrorStore {
  private dir: string;

  private constructor(dir: string) {
    super();
    this.dir = dir;
  }

  static async open(dir: string): Promise<MarkdownDirectoryStore> {
    const store = new MarkdownDirectoryStore(dir);
    await mkdir(dir, { recursive: true });
    const files = await readdir(dir);
    const records: MemoryRecord[] = [];
    for (const file of files) {
      if (!file.endsWith(".ump.md")) continue;
      records.push(fromMarkdown(await readFile(join(dir, file), "utf8")));
    }
    await store.hydrate(records);
    return store;
  }

  protected async persist(record: MemoryRecord): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const file = join(this.dir, `${safeName(record.id)}.ump.md`);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, toMarkdown(record), "utf8");
    await rename(tmp, file);
  }
}

function safeName(id: string): string {
  return id.replace(/^urn:ump:/, "").replace(/[^a-z2-7]/g, "-");
}
