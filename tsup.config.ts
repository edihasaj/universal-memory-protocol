import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/recall/index": "adapters/recall/index.ts",
    "bin/ump": "src/bin/ump.ts",
    "bin/import": "src/bin/import.ts",
    "bin/memory": "src/bin/memory.ts",
    "bin/serve": "src/bin/serve.ts",
    "bin/conformance": "src/bin/conformance.ts",
  },
  format: ["esm"],
  target: "node20",
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: "dist",
  // JSON Schema is shipped as an asset, not bundled.
  loader: { ".json": "copy" },
});
