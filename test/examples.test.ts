import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  validateDraft,
  verify,
  type MemoryRecord,
} from "../src/index.ts";

describe("portable examples", () => {
  it("keeps the responsibility-confirmed record valid and verifiable", async () => {
    const path = new URL(
      "../examples/responsibility-confirmed.ump.json",
      import.meta.url,
    );
    const record = JSON.parse(await readFile(path, "utf8")) as MemoryRecord;

    expect(validateDraft(record)).toEqual([]);
    expect(verify(record)).toBe(true);
    expect(record.provenance?.method).toBe("responsibility_confirmed");
    expect(record.body.structured?.responsibility).toMatchObject({
      status: "confirmed",
      manifest_ref: record.provenance?.source?.ref,
    });
  });
});
