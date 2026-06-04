/**
 * AMP conformance CLI. Probes an endpoint and prints its conformance level.
 *
 *   node --experimental-strip-types src/bin/conformance.ts [baseUrl] [--token <cap>]
 *   # default baseUrl: http://localhost:4000
 */

import { runConformance } from "../conformance.ts";

const args = process.argv.slice(2);
const tokenIdx = args.indexOf("--token");
const token = tokenIdx >= 0 ? args[tokenIdx + 1] : undefined;
const baseUrl = args.find((a) => !a.startsWith("--") && a !== token) ?? "http://localhost:4000";

const report = await runConformance(baseUrl, { token });

const tick = (ok: boolean) => (ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m");
process.stdout.write(`\nAMP conformance — ${baseUrl}\n\n`);
for (const c of report.checks) {
  process.stdout.write(`  ${tick(c.ok)} [${c.level}] ${c.id}  \x1b[2m${c.detail}\x1b[0m\n`);
}
const ok = report.level !== "none";
process.stdout.write(
  `\n  ${ok ? "\x1b[42m\x1b[30m" : "\x1b[41m\x1b[37m"} ${report.badge} \x1b[0m\n\n`,
);
process.exit(ok ? 0 : 1);
